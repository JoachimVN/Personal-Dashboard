# Repository Guidelines

## Project Structure & Module Organization

This npm-workspaces monorepo has three packages:

- `client/` is the React 19 + Vite dashboard. Widgets live in `client/src/widgets/`; shared UI pieces live in `client/src/components/`.
- `server/` is the Express provider service. Add external-data integrations under `server/src/providers/`, then register them in `providers/index.ts`.
- `shared/` contains Zod schemas and TypeScript types used by both client and server. Export new schemas through `shared/src/index.ts`.

Runtime configuration belongs in `server/config.json`; secrets belong in the ignored `server/.env` or `server/.tokens/`. Do not commit either. `scripts/install-launchd.sh` configures the macOS background service.

## Build, Test, and Development Commands

- `npm run dev` starts the server on port 4821 and Vite on port 5173.
- `npm run build` builds the production client into `client/dist/`.
- `npm start` serves the built dashboard through the server.
- `npm run typecheck` runs `tsc --noEmit` across all workspaces.
- `npm test` runs the server Vitest suite.
- `npm run setup:gmail -w server` completes the local Gmail OAuth setup.

Run `npm run typecheck`, `npm test`, and `npm run build` for changes that cross server, shared schemas, or client rendering.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and single quotes. Match the existing functional React style and Tailwind utility classes. Name React components in PascalCase (`WeatherWidget.tsx`), utilities and provider factories in camelCase (`createWeatherProvider`), and schema files in camelCase (`weather.ts`). Validate provider responses with Zod before they enter the scheduler cache. Keep secrets out of logs and map provider failures to safe messages.

## Testing Guidelines

Tests use Vitest and sit beside the code they cover, for example `server/src/scheduler.test.ts`. Name tests as behavior statements: `it('keeps last-good data...')`. Add focused tests for scheduler behavior, parsing, or error handling when changing server logic. Manually check UI, networking, and provider credentials after relevant changes; note any unverified runtime behavior in the handoff.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects. Existing history primarily uses `feat: ...` and `fix: ...`; follow that convention for new work. Keep commits focused, stage explicit paths, and do not include generated `client/dist/`, `.env`, or token files. PRs should summarize the behavior change, list checks run, link relevant issues, and include screenshots for visible dashboard changes.
