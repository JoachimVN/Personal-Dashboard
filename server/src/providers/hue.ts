import { z } from 'zod';
import { hueDataSchema, type HueData, type HueLight } from '@personal-dashboard/shared';
import { readHueToken, writeHueToken, type HueToken } from '../hueToken.js';
import type { Provider } from '../scheduler.js';

// All traffic goes through Philips' cloud (the official Remote API), so lights are
// controllable wherever this machine is — the bridge's LAN IP is never involved.
// The /route prefix proxies the classic local API paths verbatim.
const REMOTE_API = 'https://api.meethue.com';
const TOKEN_URL = 'https://api.meethue.com/v2/oauth2/token';

export interface HueConfig {
  clientId: string;
  clientSecret: string;
}

export interface HueProvider extends Provider<HueData> {
  /** Talks to the remote API directly — the Express route just calls this, no duplicated logic. */
  setLightState(id: string, state: { on?: boolean; brightness?: number }): Promise<void>;
}

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

/**
 * Returns a valid token record, refreshing (and re-persisting) when the access
 * token is within a minute of expiry. Hue rotates refresh tokens on every
 * refresh, so the new pair must always be saved. Never logs response bodies —
 * they carry the tokens themselves.
 */
async function currentToken(config: HueConfig, signal: AbortSignal): Promise<HueToken> {
  const token = readHueToken();
  if (!token) throw new Error('hue is not linked — run `npm run setup:hue -w server`');
  if (token.expires_at - Date.now() > 60_000) return token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`hue token refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const next: HueToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    username: token.username,
  };
  writeHueToken(next);
  return next;
}

async function remoteRequest(
  config: HueConfig,
  method: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const token = await currentToken(config, signal);
  const res = await fetch(`${REMOTE_API}/route/api/${token.username}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw new Error(`hue ${method} ${path} failed: ${res.status}`);
  return res.json();
}

/** Hue's `bri` is 1-254 (never 0, off is a separate flag) — normalize to 1-100 for the schema. */
export function normalizeBrightness(bri: number = 254): number {
  return Math.min(100, Math.max(1, Math.round((bri / 254) * 100)));
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
    // Cloud polling — coarser than the old LAN cadence to stay well inside
    // Philips' remote rate limits; control actions force a refresh anyway.
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => hue !== undefined && readHueToken() !== undefined,
    async fetch(signal): Promise<HueData> {
      if (!hue) throw new Error('hue is not configured');
      const raw = await remoteRequest(hue, 'GET', '/lights', undefined, signal);
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
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const raw = await remoteRequest(hue, 'PUT', `/lights/${id}/state`, body, controller.signal);
        assertNoBridgeError(raw);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
