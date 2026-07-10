import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { ProviderScheduler } from './scheduler.js';
import { createProviders } from './providers/index.js';

const env = loadEnv();
const config = loadConfig();
const app = express();
app.use(express.json());

const scheduler = new ProviderScheduler();
const providers = createProviders(env, config);
for (const provider of providers.all) {
  scheduler.register(provider);
}
scheduler.start();

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

app.post('/api/widgets/:id/refresh', async (req, res) => {
  if (!AI_USAGE_WIDGET_IDS.has(req.params.id)) {
    res.status(404).json({ error: 'refresh-not-supported' });
    return;
  }

  await scheduler.refresh(req.params.id);
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
