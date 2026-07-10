import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { ProviderScheduler } from './scheduler.js';
import { createProviders } from './providers/index.js';

const env = loadEnv();
const config = loadConfig();
const app = express();

const scheduler = new ProviderScheduler();
for (const provider of createProviders(env, config)) {
  scheduler.register(provider);
}
scheduler.start();

app.get('/api/health', (_req, res) => {
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
