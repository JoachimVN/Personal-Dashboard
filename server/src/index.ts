import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { healthIngestBatchSchema, healthIngestSchema } from '@personal-dashboard/shared';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { LayoutStore } from './layoutStore.js';
import { ProviderScheduler } from './scheduler.js';
import { createProviders } from './providers/index.js';
import { createIssue, issueErrorCode, parseIssueInput } from './issues.js';
import { availableProjects, codeActionError, launchCodeAction } from './codeSession.js';
import { listOwnedRepos } from './providers/github.js';
import { todayInZone } from './providers/health.js';

const env = loadEnv();
const config = loadConfig();
const app = express();
app.disable('x-powered-by');
app.use(express.json());

const scheduler = new ProviderScheduler();
const providers = createProviders(env, config);
for (const provider of providers.all) {
  scheduler.register(provider);
}
scheduler.start();

const layoutStore = new LayoutStore(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/layout.json'),
);

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
  await scheduler.refresh('weather'); // refresh() never throws — it stores the failure on the entry
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
  // TEMP: debugging Shortcut payloads — remove once the Shortcut is stable.
  appendFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/ingest-debug.log'),
    `${JSON.stringify({ at: new Date().toISOString(), body: req.body })}\n`,
  );
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
    providers.health.ingest(sample, today);
  }
  await scheduler.refresh('health'); // reflect the new samples immediately, not on the next 5-min poll
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
    res.json({ repos: await listOwnedRepos(env.github) });
  } catch {
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

app.listen(env.port, env.host, () => {
  console.log(`Dashboard server on http://${env.host}:${env.port} (${env.timezone})`);
});
