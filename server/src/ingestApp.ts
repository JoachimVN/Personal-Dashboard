import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { HealthIngest } from '@personal-dashboard/shared';
import { parseHealthIngestBody } from './healthIngest.js';
import { todayInZone } from './providers/health.js';

/**
 * The only capability this service is given. Narrower than `HealthStore` on purpose: an endpoint
 * that is reachable from the public internet should not be holding a handle that can read or
 * write anything else in the dashboard's database.
 */
export interface HealthIngestSink {
  ingest(sample: HealthIngest, today: string): Promise<unknown>;
}

/**
 * Compares digests rather than the raw strings: `timingSafeEqual` throws on length mismatch, and
 * length-checking first would leak the token's length to a caller who is guessing.
 */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

/**
 * A standalone Express app exposing nothing but the Apple Health ingest route, so the Shortcut has
 * a target that stays up when both dashboard machines are asleep. Both write to the same Railway
 * Postgres, so rows posted here show up on every dashboard at its next `health` poll.
 */
export function createIngestApp(options: {
  store: HealthIngestSink;
  timezone: string;
  token: string;
  /** Announces the write so dashboards refresh now rather than on their next poll. */
  onIngested?: (dayCount: number) => Promise<void>;
}): Express {
  const { store, timezone, token, onIngested } = options;
  const app = express();
  app.disable('x-powered-by');
  // A 31-day window of numbers is a few KB; nothing legitimate reaching this route is larger.
  app.use(express.json({ limit: '64kb' }));

  // Liveness probe for Railway's healthcheck. Unauthenticated and says nothing about the data.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/health/ingest', async (req, res) => {
    if (!tokenMatches(bearerToken(req), token)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const samples = parseHealthIngestBody(req.body);
    if (!samples) {
      res.status(400).json({ error: 'invalid-health-sample' });
      return;
    }
    const today = todayInZone(timezone);
    try {
      for (const sample of samples) {
        await store.ingest(sample, today);
      }
    } catch (error) {
      // Same rule as the scheduler: log the detail, return a category. A Postgres error body can
      // carry connection details, and this response goes out over the public internet.
      console.error('[ingest] failed to store health samples:', error);
      res.status(503).json({ error: 'ingest-failed' });
      return;
    }
    // One announcement per request, not per day: a 31-day window is a single event to react to.
    await onIngested?.(samples.length);
    res.json({ ok: true, days: samples.length });
  });

  // Malformed JSON never reaches the route — express.json() rejects it first. Answer in JSON
  // instead of the default HTML error page, which echoes the body back in its message.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(400).json({ error: 'invalid-request' });
  });

  return app;
}
