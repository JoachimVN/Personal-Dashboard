import https from 'node:https';
import { z } from 'zod';
import { hueDataSchema, type HueData, type HueLight } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

export interface HueConfig {
  bridgeIp: string;
  username: string;
}

export interface HueProvider extends Provider<HueData> {
  /** Talks to the bridge directly — the Express route just calls this, no duplicated bridge logic. */
  setLightState(id: string, state: { on?: boolean; brightness?: number }): Promise<void>;
}

// The bridge serves a self-signed cert on the LAN; this traffic never leaves the local network.
const bridgeAgent = new https.Agent({ rejectUnauthorized: false });

const bridgeLightSchema = z.object({
  name: z.string(),
  state: z.object({
    on: z.boolean(),
    bri: z.number().optional(),
    reachable: z.boolean().optional(),
  }),
});
const bridgeLightsSchema = z.record(z.string(), bridgeLightSchema);

const bridgeResultEntrySchema = z.union([
  z.object({ success: z.record(z.string(), z.unknown()) }),
  z.object({ error: z.object({ type: z.number(), address: z.string(), description: z.string() }) }),
]);
const bridgeResultArraySchema = z.array(bridgeResultEntrySchema);

/** Hue's v1 API returns HTTP 200 even on failure — the real result lives in this JSON array. */
export function assertNoBridgeError(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  const results = bridgeResultArraySchema.parse(raw);
  const failure = results.find(
    (entry): entry is Extract<(typeof results)[number], { error: unknown }> => 'error' in entry,
  );
  if (failure) throw new Error(`Hue bridge error: ${failure.error.description}`);
}

function bridgeRequest(
  config: HueConfig,
  method: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: config.bridgeIp,
        path: `/api/${config.username}${path}`,
        method,
        agent: bridgeAgent,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    const onAbort = () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      req.destroy(err);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Hue's `bri` is 1-254 (never 0, off is a separate flag) — normalize to 1-100 for the schema. */
export function normalizeBrightness(bri: number | undefined): number {
  const value = bri ?? 254;
  return Math.min(100, Math.max(1, Math.round((value / 254) * 100)));
}

export function denormalizeBrightness(percent: number): number {
  return Math.min(254, Math.max(1, Math.round((percent / 100) * 254)));
}

/** Brightness is left untouched when only toggling off, so the light remembers its level. */
export function buildLightStateBody(state: { on?: boolean; brightness?: number }): {
  on?: boolean;
  bri?: number;
} {
  const body: { on?: boolean; bri?: number } = {};
  if (state.on !== undefined) body.on = state.on;
  if (state.brightness !== undefined && state.on !== false) {
    body.bri = denormalizeBrightness(state.brightness);
  }
  return body;
}

export function createHueProvider(hue: HueConfig | undefined): HueProvider {
  return {
    id: 'hue',
    schema: hueDataSchema,
    refreshMs: 15_000,
    timeoutMs: 5_000,
    isConfigured: () => hue !== undefined,
    async fetch(signal): Promise<HueData> {
      if (!hue) throw new Error('hue is not configured');
      const raw = await bridgeRequest(hue, 'GET', '/lights', undefined, signal);
      assertNoBridgeError(raw);
      const bridgeLights = bridgeLightsSchema.parse(raw);
      const lights: HueLight[] = Object.entries(bridgeLights).map(([id, light]) => ({
        id,
        name: light.name,
        on: light.state.on,
        brightness: normalizeBrightness(light.state.bri),
        reachable: light.state.reachable ?? true,
      }));
      return { lights };
    },
    async setLightState(id, state): Promise<void> {
      if (!hue) throw new Error('hue is not configured');
      const body = buildLightStateBody(state);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const raw = await bridgeRequest(hue, 'PUT', `/lights/${id}/state`, body, controller.signal);
        assertNoBridgeError(raw);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
