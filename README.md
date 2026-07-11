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

Each service has its own card showing its current rolling allowance: **five-hour** and **weekly** percentages, with reset times — not token totals or estimated costs. A thin marker on each bar shows where usage "should" be if it tracked evenly with the window's elapsed time; the marker turns amber when usage is running ahead of that pace.

- **Codex:** no setup when Codex is signed in locally; its local session snapshots contain the current account limits. This card polls those local files only (no network call), so it refreshes independently and much more often than Claude — tune the interval with `aiUsage.codexRefreshMs` (ms, default `30000`) in `server/config.json`.
- **Claude Code:** set `CLAUDE_CODE_OAUTH_TOKEN` in `server/.env` to the OAuth access token used by your signed-in Claude Code account (run `claude setup-token`). This is not an Anthropic API key. The Claude endpoint is an internal CLI integration with a tight rate limit, so this card stays on a fixed 5-minute refresh regardless of the Codex setting; the dashboard leaves Claude unavailable if the token expires or Anthropic changes it.

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

### Philips Hue

One-time pairing:

1. Find your bridge's IP — either via [discovery.meethue.com](https://discovery.meethue.com) or your router's device list.
2. Press the physical link button on the bridge, then within ~30 seconds run:
   ```bash
   curl -k -X POST https://<bridge-ip>/api -d '{"devicetype":"personal-dashboard"}'
   ```
   (`-k` skips certificate verification — the bridge's HTTPS cert is self-signed and never leaves your LAN.) The response contains a `username` — that's your API key.
3. Set in `server/.env`:
   - `HUE_BRIDGE_IP` — the bridge's IP
   - `HUE_USERNAME` — the API key from step 2
4. Restart the server — like every env-configured widget, Hue is only checked at startup.

Control is read + write: toggling a light or dragging its brightness slider sends the change straight to the bridge. Individual lights only for now — no rooms/groups/scenes. If the bridge's IP ever changes (e.g. a new DHCP lease), update `HUE_BRIDGE_IP` and restart.

### iMessage (macOS only)

Reads `~/Library/Messages/chat.db` directly (read-only) — no setup beyond granting **Full Disk Access**:

1. System Settings → Privacy & Security → **Full Disk Access**.
2. Add the process that actually reads the file, not just "Terminal" in the abstract:
   - Running via `npm run dev` from Terminal.app or iTerm — add that terminal app.
   - Running via the `install-launchd.sh` agent — launchd execs `node` directly with no GUI parent, so add the **node binary itself** (find it with `which node`, e.g. `/opt/homebrew/bin/node`).
3. Restart the server — granting access mid-session doesn't retroactively enable the widget.

Shows the most recent message per conversation and an unread count; group-chat/contact names fall back to the raw handle (phone/email) when macOS hasn't set a display name, and rich messages without plain text show as `[message]` (Apple stores those in a binary format this doesn't parse).

⚠️ **Privacy**: message previews are cached server-side and served to any device that reaches this dashboard, i.e. your phone over Tailscale — not just something read and kept on the Mac.

## Arranging widgets

The Personal section's widget cards can be reordered: open **Personal** → **Arrange** (top-right), then drag a card to its new position. The order is saved server-side (`server/.data/layout.json`, gitignored) and shared across every device that reaches this dashboard.
