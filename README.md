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

## Phone access (Tailscale Serve)

The server binds to loopback only. To reach it from your phone:

```bash
tailscale serve 4821
```

This proxies the dashboard onto your tailnet with HTTPS (required for PWA install). Open the printed `https://<machine>.<tailnet>.ts.net` URL on your phone and use Share → **Add to Home Screen**.

Setting `HOST=0.0.0.0` instead exposes the dashboard **unauthenticated** on your LAN — only do that on networks you trust.

## Checks

```bash
npm run typecheck   # tsc --noEmit in all workspaces
npm test            # vitest (scheduler/cache behavior)
```

## Widget setup

Docs for each widget's credentials (GitHub PAT permissions, iCloud app-specific password, Google OAuth client) land here as the widgets are built.
