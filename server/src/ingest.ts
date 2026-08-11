import 'dotenv/config';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { HealthStore } from './healthStore.js';
import { SignalHistoryStore } from './signalHistory.js';
import { notifyProviderRefresh } from './refreshNotify.js';
import { createIngestApp } from './ingestApp.js';

/**
 * Always-on Apple Health ingest, deployed alongside the dashboard's Railway Postgres.
 *
 * The dashboards themselves are laptops and desktops that sleep, so a Shortcut pointed at one of
 * them fails whenever that machine is off. Storage is not the problem — every dashboard already
 * shares one Postgres — so this runs the ingest route, and only that route, somewhere that stays
 * up. See `src/index.ts` for the equivalent route on the Tailscale-only dashboards.
 */

// Configuration is validated before the resilience handlers below are installed, so a misconfigured
// deploy crashes the process outright instead of lingering as a container that never binds a port.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Point it at the same Postgres the dashboards use, otherwise the ' +
      'posted samples land somewhere nothing reads.',
  );
}

const MIN_TOKEN_LENGTH = 24;
const token = process.env.HEALTH_INGEST_TOKEN;
if (!token || token.length < MIN_TOKEN_LENGTH) {
  throw new Error(
    `HEALTH_INGEST_TOKEN is required and must be at least ${MIN_TOKEN_LENGTH} characters. Unlike ` +
      'the dashboards, this service is reachable from the public internet rather than only over ' +
      'Tailscale, so the shared secret is the only thing in front of the database.',
  );
}

const timezone = process.env.DASHBOARD_TIMEZONE ?? 'Europe/Oslo';
// Railway injects PORT; the local default avoids the dashboard's 4821 and its dev server's 4822.
const port = Number(process.env.PORT ?? 4823);

// One route, one statement per request — the dashboard's pool of 5 would be idle connections.
const database = createDatabase(databaseUrl, 2);
try {
  await migrateDatabase(database);
} catch (error) {
  console.error('[ingest] could not migrate the database, refusing to start:', error);
  process.exit(1);
}

// Optional: without it the webhook route is not mounted at all, so a dashboard that never set one
// up has no unauthenticated GitHub surface sitting there.
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET || undefined;
const signalHistory = new SignalHistoryStore(database);

const app = createIngestApp({
  store: new HealthStore(database),
  timezone,
  token,
  onIngested: () => notifyProviderRefresh(database, 'health'),
  githubWebhookSecret,
  onGithubEvent: async (eventName, payload) => {
    // Archived under the event name so history is queryable per kind, then announced so dashboards
    // re-poll the GitHub API. The webhook is a cache-invalidation signal, not the data source: the
    // provider already knows how to assemble its own payload, and this saves modelling every
    // GitHub event shape.
    await signalHistory.record('github-webhook', eventName, payload as never);
    await notifyProviderRefresh(database, 'github');
  },
});
// 0.0.0.0, not loopback: Railway routes external traffic to the container's published port.
app.listen(port, '0.0.0.0', () => {
  console.log(`[ingest] health ingest listening on 0.0.0.0:${port} (timezone ${timezone})`);
});

// Matches src/index.ts: a blip on Railway's TCP proxy should not take the running service down.
process.on('unhandledRejection', (reason) => {
  console.error('[ingest] unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[ingest] uncaught exception:', error);
});
