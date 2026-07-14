# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal dashboard (weather, calendar, email, GitHub, AI usage, news) that runs locally on the
user's own machine and is reached from a phone over Tailscale. No database, no multi-user auth —
secrets live in gitignored `server/.env` / `server/.tokens/`.

npm-workspaces monorepo: `shared/` (zod schemas + types) ← `server/` (Express) and `client/` (React SPA).

## Architecture

### The provider/scheduler/envelope pattern (the core abstraction)

Every data source (weather, calendar, Gmail, GitHub, AI usage, news, system) is a **`Provider`**
(`server/src/scheduler.ts`): an object with `id`, a zod `schema`, `refreshMs`, `timeoutMs`,
`isConfigured()`, and `fetch(signal)`. Providers are constructed in `server/src/providers/index.ts`
from `ServerEnv` (secrets/credentials, `server/src/env.ts`) and `AppConfig` (non-secret settings from
`server/config.json`, `server/src/config.ts`), then registered with a single `ProviderScheduler`.

The scheduler polls each configured provider on its own interval, forever, independent of any HTTP
request:
- Fetch output is validated against the provider's schema before being cached; a schema failure is
  treated the same as a fetch failure.
- Single-flight per provider — an overlapping refresh is a no-op.
- Errors are sanitized to a category string (`timeout` / `invalid-response` / `fetch-failed`) before
  being stored or logged, so raw error bodies (which can carry tokens/account info) never leak.
- Widget status is one of `loading | ready | stale | error | disabled`. `stale` means "last fetch
  failed but we still have earlier good data" — the cache always serves the last good payload until
  a newer one replaces it. `disabled` means `isConfigured()` was false at registration; that provider
  is never fetched at all.

`GET /api/widgets/:id` (`server/src/index.ts`) just returns `scheduler.getEnvelope(id)` — a
`WidgetEnvelope<T>` (`shared/src/widget.ts`) with `status`, `data`, `fetchedAt`, `lastAttemptAt`,
`error`, `refreshMs`. There's no per-request fetch-on-demand; the client is reading a cache.

**Adding a new data source** means: add a schema to `shared/src/schemas/`, export it from
`shared/src/index.ts`, add a `createXProvider(...): Provider<XData>` factory in
`server/src/providers/x.ts`, wire it into `createProviders()` in `server/src/providers/index.ts`, and
add a widget component under `client/src/widgets/` that calls `useWidget<XData>('x-id')`.

### Config vs. env

- `server/.env` (gitignored): secrets and per-machine credentials — API tokens, OAuth tokens,
  coordinates. Read via `server/src/env.ts` (`ServerEnv`). Each machine's dashboard only shows what
  that machine has credentials for.
- `server/config.json` (gitignored, not secret): user preferences that aren't credentials —
  calendar allowlist, news feeds, refresh intervals, local repos root. Read via
  `server/src/config.ts` (`AppConfig`), zod-validated with defaults so a missing file is fine.
  It isn't secret, but it is personal — calendar names, a home directory path — so it's ignored
  like `.env` and `server/config.example.json` is tracked in its place.
