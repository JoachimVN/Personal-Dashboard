import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { healthIngestBatchSchema, healthIngestSchema } from '@personal-dashboard/shared';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { LayoutStore } from './layoutStore.js';
import { ProviderScheduler } from './scheduler.js';
import { createProviders } from './providers/index.js';
import { createCommandCenterProvider } from './providers/commandCenter.js';
import { SignalHistoryStore } from './signalHistory.js';
import { createIssue, issueErrorCode, parseIssueInput } from './issues.js';
import { availableProjects, codeActionError, launchCodeAction } from './codeSession.js';
import { createOwnedReposCache, listOwnedRepos } from './providers/github.js';
import { todayInZone } from './providers/health.js';
import { logClashRoyalePublicIp } from './providers/clashRoyale.js';

const env = loadEnv();
const config = loadConfig();
const database = createDatabase(env.databaseUrl);
await migrateDatabase(database);
const app = express();
app.disable('x-powered-by');
app.use(express.json());

const scheduler = new ProviderScheduler();
const providers = createProviders(env, config, database);
for (const provider of providers.all) {
  scheduler.register(provider);
}
const signalHistory = new SignalHistoryStore(database);
scheduler.register(createCommandCenterProvider(scheduler, signalHistory, config));
// Recompute the ranking as soon as any source settles, not just on command-center's own timer —
// otherwise a cold start can snapshot an all-fallback ranking and sit on it for a full cycle.
// Throttled: with ~15 providers settling independently (some every few seconds), triggering the
// DB-heavy command-center fetch on every single settle saturates the Postgres pool and starves
// command-center's own 5s budget — see the timeout incident this was written to fix.
const COMMAND_CENTER_SETTLE_THROTTLE_MS = 10_000;
let commandCenterSettleTimer: NodeJS.Timeout | undefined;
scheduler.onSettled((id) => {
  if (id === 'command-center' || commandCenterSettleTimer) return;
  commandCenterSettleTimer = setTimeout(() => {
    commandCenterSettleTimer = undefined;
    void scheduler.refresh('command-center');
  }, COMMAND_CENTER_SETTLE_THROTTLE_MS);
  commandCenterSettleTimer.unref?.();
});
scheduler.start();
// Clash Royale's API key is IP-locked; this is a quick copy-paste source for the allowlist at
// developer.clashroyale.com when it drifts (dynamic IP, or a machine that moves networks).
if (env.clashRoyale) void logClashRoyalePublicIp();

const layoutStore = new LayoutStore(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/layout.json'),
);
const ownedReposCache = createOwnedReposCache();

const AI_USAGE_WIDGET_IDS = new Set(['ai-usage-claude', 'ai-usage-codex']);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

app.post('/api/weather/location', async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-location' });
    return;
  }
  providers.weather.setCoords(parsed.data);
  providers.transit.setCoords(parsed.data);
  providers.power.setCoords(parsed.data);
  await scheduler.refresh('weather'); // refresh() never throws — it stores the failure on the entry
  await scheduler.refresh('transit');
  await scheduler.refresh('power');
  res.json({ ok: true });
});

const hueStateSchema = z
  .object({
    on: z.boolean().optional(),
    brightness: z.number().min(1).max(100).optional(),
  })
  .refine((body) => body.on !== undefined || body.brightness !== undefined, {
    message: 'at least one of on/brightness is required',
  });

app.post('/api/hue/lights/:id', async (req, res) => {
  const parsed = hueStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-hue-state' });
    return;
  }
  try {
    await providers.hue.setLightState(req.params.id, parsed.data);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

const hueGroupSchema = z.object({ on: z.boolean() });

app.post('/api/hue/groups/:id', async (req, res) => {
  const parsed = hueGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-hue-state' });
    return;
  }
  try {
    await providers.hue.setGroupState(req.params.id, parsed.data.on);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

app.post('/api/hue/scenes/:id', async (req, res) => {
  try {
    await providers.hue.activateScene(req.params.id);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

// Ingest endpoint for an Apple Health Shortcut running on the user's phone (over Tailscale).
// Same trust model as the rest of the dashboard: loopback + `tailscale serve`, no separate auth.
// Accepts either a single day sample or `{ days: [...] }` covering a multi-day window.
app.post('/api/health/ingest', async (req, res) => {
  const isBatch = typeof req.body === 'object' && req.body !== null && 'days' in req.body;
  const parsed = isBatch
    ? healthIngestBatchSchema.safeParse(req.body)
    : healthIngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-health-sample' });
    return;
  }
  const today = todayInZone(env.timezone);
  const samples = 'days' in parsed.data ? parsed.data.days : [parsed.data];
  for (const sample of samples) {
    await providers.health.ingest(sample, today);
  }
  await scheduler.refresh('health'); // reflect the new samples immediately, not on the next 5-min poll
  await scheduler.refresh('command-center');
  res.json({ ok: true });
});

const layoutOrderSchema = z.object({
  order: z.array(z.string().min(1)).refine((order) => new Set(order).size === order.length, {
    message: 'order must not contain duplicates',
  }),
});

app.get('/api/layout', (_req, res) => {
  res.json({ layout: layoutStore.getAll() });
});

app.put('/api/layout/:sectionId', (req, res) => {
  const parsed = layoutOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-layout-order' });
    return;
  }
  layoutStore.set(req.params.sectionId, parsed.data.order);
  res.json({ order: parsed.data.order });
});

app.get('/api/widgets', (_req, res) => {
  res.json({ widgets: scheduler.list() });
});

app.get('/api/widgets/:id', (req, res) => {
  const envelope = scheduler.getEnvelope(req.params.id);
  if (!envelope) {
    res.status(404).json({ error: 'unknown-widget' });
    return;
  }
  res.json(envelope);
});

app.get('/api/github/repos', async (_req, res) => {
  if (!env.github) {
    res.status(503).json({ error: 'github-not-configured' });
    return;
  }
  try {
    const { repos, stale } = await ownedReposCache(env.github);
    if (stale) console.warn('[github/repos] serving cached repositories after upstream failure');
    res.json({ repos });
  } catch (error) {
    // Never log the raw error here — it can carry the auth token in its request URL/headers.
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: unknown }).status : undefined;
    const statusLabel = typeof status === 'number' || typeof status === 'string' ? String(status) : 'unknown';
    console.error(`[github/repos] failed (status ${statusLabel})`);
    res.status(502).json({ error: 'github-repos-failed' });
  }
});

app.post('/api/github/issues', async (req, res) => {
  if (!env.githubIssuesToken || !env.github) {
    res.status(503).json({ error: 'github-issues-not-configured' });
    return;
  }
  try {
    const allowedRepos = await listOwnedRepos(env.github);
    const issue = parseIssueInput(req.body, allowedRepos);
    res.status(201).json(await createIssue(env.githubIssuesToken, issue));
  } catch (error) {
    const code = issueErrorCode(error);
    if (code === 'github-write-failed') console.error(`[github/issues] failed (${code})`);
    res.status(code === 'invalid-issue' || code === 'repo-not-allowed' ? 400 : 502).json({ error: code });
  }
});

app.get('/api/code/projects', (_req, res) => res.json({ projects: availableProjects(config) }));

app.post('/api/code/actions', async (req, res) => {
  try {
    await launchCodeAction(req.body, config);
    res.status(204).end();
  } catch (error) {
    const code = codeActionError(error);
    res.status(code === 'invalid-code-action' || code === 'project-not-configured' ? 400 : 502).json({ error: code });
  }
});

app.post('/api/widgets/:id/refresh', async (req, res) => {
  if (!AI_USAGE_WIDGET_IDS.has(req.params.id)) {
    res.status(404).json({ error: 'refresh-not-supported' });
    return;
  }

  await scheduler.refresh(req.params.id, true);
  const envelope = scheduler.getEnvelope(req.params.id);
  if (!envelope) {
    res.status(404).json({ error: 'unknown-widget' });
    return;
  }
  res.json(envelope);
});

if (env.isProduction) {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = app.listen(env.port, env.host, () => {
  console.log(`Dashboard server on http://${env.host}:${env.port} (${env.timezone})`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.port} is already in use — a stale server process is likely still running. ` +
        `Run \`lsof -ti tcp:${env.port} | xargs kill\` and restart.`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

async function closeDatabase(): Promise<void> {
  scheduler.stop();
  await database.client.end({ timeout: 5 });
}

process.once('SIGINT', () => void closeDatabase().finally(() => process.exit(0)));
process.once('SIGTERM', () => void closeDatabase().finally(() => process.exit(0)));
