# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal dashboard (weather, calendar, email, GitHub, AI usage, news) that runs locally on the
user's own machine and is reached from a phone over Tailscale. No database, no multi-user auth —
secrets live in gitignored `server/.env` / `server/.tokens/`.

npm-workspaces monorepo: `shared/` (zod schemas + types) ← `server/` (Express) and `client/` (React SPA).

## Commands

```bash
npm install
npm run dev          # server :4821 + client :5173, concurrently
npm run build         # builds client only
npm start             # production: server serves client/dist at :4821 (NODE_ENV=production)
npm run typecheck     # tsc --noEmit in every workspace
npm test              # vitest run, server workspace only (scheduler/cache behavior)
```

Single test file: `npm test -w server -- scheduler.test.ts` (vitest run against `server/src/`).
There is no lint script.

Gmail one-time OAuth setup: `npm run setup:gmail -w server` (writes `server/.tokens/gmail.json`).

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

The AI usage providers additionally record trend points through `server/src/usageHistory.ts`
(`UsageHistoryStore`): a shared store that samples each genuinely-new snapshot (deduped by `asOf`,
throttled by `aiUsage.historySampleMs`, pruned after `aiUsage.historyRetentionDays`) into the
gitignored `server/.data/ai-usage-history.json` and embeds the history in the provider payload.

### Client polling and rendering

`client/src/useWidget.ts` polls `/api/widgets/:id` at half the server's `refreshMs` (clamped between
15s and 5min), plus immediately on `visibilitychange`. It tracks `offline` separately from envelope
`status` — `offline` means the dashboard's own server is unreachable, not that a given provider
failed.

`client/src/components/WidgetCard.tsx` has two layers:
- `WidgetBody` is the `loading/disabled/error/ready` rendering state machine for **one** envelope.
- `WidgetShell` is just the card chrome (border, header, badge slot) with no envelope logic.
- `WidgetCard` = `WidgetShell` + `WidgetBody` for the common case of one card backed by one envelope.

Use `WidgetShell` + `WidgetBody` directly (see `sections/ai/AiDetail.tsx` or the section overview
components) when a card doesn't map 1:1 onto a single envelope — e.g. Claude and Codex usage poll
on different schedules and must not block each other's rendering or share one `error`/`stale` state.

### Sections and navigation

The UI is organized into **sections** (AI, GitHub, Personal), each with a condensed `Overview`
block on the landing page and a full `Detail` view. Everything derives from
`client/src/sections/registry.tsx` — adding a section = one `SECTIONS` entry plus its
Overview/Detail components. Navigation is hash-based (`client/src/router.ts`, `#/ai` etc.) so deep
links never hit the server's SPA catch-all. `SectionCard` (overview block) and `SectionView`
(expanded view header) share `motion` layoutIds, which produces the expand/morph animation;
page-level animation config (`MotionConfig`/`LayoutGroup`/`AnimatePresence`) lives in `App.tsx`.
Design tokens (glass surfaces, ink text hierarchy, per-section accents) are `@theme` variables in
`client/src/index.css`, mode-adaptive via `light-dark()` — use them instead of raw palette classes.

### Why some providers look more complex than others

- **AI usage** (`server/src/providers/aiUsage.ts`) is actually two providers,
  `createClaudeUsageProvider` and `createCodexUsageProvider`, each with its own widget id
  (`ai-usage-claude`, `ai-usage-codex`) and refresh cadence, even though they render in one section.
  Codex reads local session files (cheap, configurable cadence via `config.json`); Claude hits a
  rate-limited external endpoint and keeps a mutable in-closure `cooldown` that self-imposed backs off
  on a 429 (via `Retry-After`) independent of the scheduler's own interval.
- Provider `fetch` functions generally avoid logging raw response bodies/errors for anything that
  touches an authenticated account (see the comment in `claudeSnapshot`) — sanitize before logging,
  don't rely solely on the scheduler's category-string sanitization.

### Config vs. env

- `server/.env` (gitignored): secrets and per-machine credentials — API tokens, OAuth tokens,
  coordinates. Read via `server/src/env.ts` (`ServerEnv`). Each machine's dashboard only shows what
  that machine has credentials for.
- `server/config.json` (tracked, not secret): user preferences that aren't credentials — pinned
  repos, calendar allowlist, news feeds, refresh intervals. Read via `server/src/config.ts`
  (`AppConfig`), zod-validated with defaults so a missing file is fine.
