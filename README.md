# Personal Dashboard

One glanceable page for life + dev: weather, calendar, email, GitHub, and AI usage. Runs locally on your own machine (Mac or Windows); your phone reaches it privately over [Tailscale](https://tailscale.com).

## Stack

npm-workspaces monorepo:

- **`client/`** — React + Vite + Tailwind SPA with a PWA manifest (install to phone home screen).
- **`server/`** — Express on `127.0.0.1:4821`. Each data source is a *provider* polled on its own interval; results are schema-validated (zod) and cached in memory. Widgets read the cache via `/api/widgets/:id`.
- **`shared/`** — zod schemas + types shared by both.

No database. Secrets live in gitignored `server/.env` / `server/.tokens/`.

## Getting started

```bash
npm install
cp server/.env.example server/.env   # fill in what you want enabled
npm run dev                          # server :4821 + client :5173
```

Widgets without credentials show as "not configured" instead of breaking — enable them one at a time.

Production mode (server serves the built client at `http://localhost:4821`):

```bash
npm run build
npm start
```

## Run at login

**macOS** — installs (or refreshes) a launchd agent that builds the client and keeps `npm start` running:

```bash
./scripts/install-launchd.sh
```

**Windows** — two options:

- *Startup shortcut*: `Win+R` → `shell:startup` → add a shortcut with target
  `cmd /c "cd /d C:\path\to\Personal-Dashboard && npm start"` (runs with a visible console).
- *Task Scheduler* (headless): create a task triggered **At log on**, action `cmd`, arguments
  `/c cd /d C:\path\to\Personal-Dashboard && npm start`, and tick "Run whether user is logged on or not".

Run `npm run build` once first on Windows so `client/dist` exists.

## Phone access (Tailscale Serve)

The server binds to loopback only. To reach it from your phone:

```bash
tailscale serve 4821
```

This proxies the dashboard onto your tailnet with HTTPS (required for PWA install). Requirements: Tailscale installed and signed in on this machine and on your phone (same tailnet), and HTTPS certificates enabled once in the [admin console](https://login.tailscale.com/admin/dns) (Enable HTTPS).

On the phone, open the printed `https://<machine>.<tailnet>.ts.net` URL in Safari and use Share → **Add to Home Screen** — the dashboard then launches fullscreen like an app. Both your Mac and Windows PC can serve their own instance; the phone just bookmarks each machine's URL.

Setting `HOST=0.0.0.0` instead exposes the dashboard **unauthenticated** on your LAN — only do that on networks you trust.

## Checks

```bash
npm run typecheck   # tsc --noEmit in all workspaces
npm test            # vitest (scheduler/cache behavior)
```

## Widget setup

### Weather (MET Norway)

No key needed — set `WEATHER_LAT` / `WEATHER_LON` in `server/.env`.

### GitHub

Set `GITHUB_USERNAME` and `GITHUB_TOKEN` in `server/.env`. Create a **fine-grained PAT** (github.com → Settings → Developer settings) with:

- **Repository access**: All repositories (or at least your pinned ones)
- **Repository permissions**: Contents *read*, Actions *read*, Issues *read*, Pull requests *read* (Metadata read is added automatically)

If the contribution graph errors with a fine-grained PAT, fall back to a classic PAT with `repo` + `read:user` scopes.

Pinned repos for the repo-health card live in `server/config.json`.

Note: the activity feed uses GitHub's events API, which is **delayed** (typically minutes) — it is not real-time.

### AI usage (Claude Code / Codex)

The widget shows each service's current rolling allowance: **five-hour** and **weekly** percentages, with reset times — not token totals or estimated costs.

- **Codex:** no setup when Codex is signed in locally; its local session snapshots contain the current account limits.
- **Claude Code:** set `CLAUDE_CODE_OAUTH_TOKEN` in `server/.env` to the OAuth access token used by your signed-in Claude Code account. This is not an Anthropic API key. The Claude endpoint is an internal CLI integration, so the dashboard leaves Claude unavailable if the token expires or Anthropic changes it.

Each machine's dashboard reports that machine's signed-in accounts only. News feeds are configured in `server/config.json`.

### Calendar (iCloud / Apple Calendar)

1. Go to [account.apple.com](https://account.apple.com) → Sign-In and Security → **App-Specific Passwords** → generate one (call it e.g. `dashboard`).
2. Set in `server/.env`:
   - `ICLOUD_USERNAME` — your Apple ID email
   - `ICLOUD_APP_PASSWORD` — the generated `xxxx-xxxx-xxxx-xxxx` password

By default all event calendars are shown; to limit it, list display names in `server/config.json` under `calendar.allowlist` (e.g. `["Personal", "NTNU"]`).

### Gmail

One-time setup:

1. In [console.cloud.google.com](https://console.cloud.google.com), create a project (e.g. `personal-dashboard`), enable the **Gmail API**, and configure the OAuth consent screen.
2. Create an OAuth client of type **Desktop app**; put its ID/secret in `server/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. Run `npm run setup:gmail -w server`, open the printed URL, approve. The refresh token is saved to `server/.tokens/gmail.json` (owner-only permissions); restart the server.

The widget requests only the **`gmail.metadata`** scope — message headers and labels, never bodies.

⚠️ **Testing-mode expiry**: while the OAuth consent screen is in *Testing* status, Google expires refresh tokens after **7 days** and you'd have to re-run setup weekly. Fix: on the consent screen page, add yourself as a test user, then **publish** the app (it can stay unverified — only your own account uses it); published apps get long-lived refresh tokens.
