import 'dotenv/config';
import { createDatabase } from './db/client.js';
import { HealthStore } from './healthStore.js';
import { SignalHistoryStore } from './signalHistory.js';
import { notifyProviderRefresh } from './refreshNotify.js';
import { describeGithubWebhookEvent, githubActivityPushUrl } from './githubWebhook.js';
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
// Migrations deliberately do NOT run here. drizzle-orm costs ~160 MB resident and this container is
// billed by the GB-month, so it runs as its own process that exits first — `railway.json` chains
// `db:migrate && start:ingest`, and a failed migration still stops the deploy before this binds a
// port. The dashboards in `src/index.ts` keep migrating in-process: they run on laptops, not a
// meter.

// Optional: without it the webhook route is not mounted at all, so a dashboard that never set one
// up has no unauthenticated GitHub surface sitting there.
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET || undefined;
const signalHistory = new SignalHistoryStore(database);

// Optional second hop: relay recognized events to the pushed-activity sink. The dashboards already
// push other live signals there, but they sleep — sending from here is the first signal that keeps
// flowing when both machines are off.
const pushUrl = process.env.DASHBOARD_PUSH_URL;
const pushSecret = process.env.DASHBOARD_PUSH_SECRET;

async function forwardGithubActivity(eventName: string, payload: unknown): Promise<void> {
  if (!pushUrl || !pushSecret) return;
  const activity = describeGithubWebhookEvent(eventName, payload);
  if (!activity) return; // unrecognized shape — better to send nothing than something wrong
  try {
    const response = await fetch(githubActivityPushUrl(pushUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${pushSecret}` },
      body: JSON.stringify(activity),
      // GitHub treats a delivery as failed after ~10s and retries it, so this hop must not be
      // allowed to consume that budget — the event is already archived and announced regardless.
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error(`[ingest] activity push rejected the event: ${response.status}`);
  } catch (error) {
    console.error('[ingest] could not forward GitHub activity:', error);
  }
}

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
    await forwardGithubActivity(eventName, payload);
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
