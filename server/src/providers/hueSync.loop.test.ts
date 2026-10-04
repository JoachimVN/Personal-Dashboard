import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifySnapshotStore } from '../spotifyCache.js';
import type { HueLightSnapshot, HueLightStateBody, HueProvider } from './hue.js';
import { createHueSyncProvider, type HueSyncProvider } from './hueSync.js';

vi.mock('./spotify.js', () => ({ accessToken: async () => 'token' }));

/** A one-color 8x8 JPEG, so each fake album has an unmistakable palette. */
function solidJpeg([r, g, b]: [number, number, number]): Buffer {
  const data = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return jpeg.encode({ data, width: 8, height: 8 }, 95).data;
}

const COVERS: Record<string, Buffer> = {
  'https://img/red': solidJpeg([220, 20, 30]),
  'https://img/blue': solidJpeg([20, 50, 220]),
};

const rawTrack = (id: string, cover: string, durationMs: number) => ({
  id,
  name: `Song ${id}`,
  duration_ms: durationMs,
  artists: [{ name: 'Artist' }],
  album: { images: [{ url: cover }] },
});

const TRACK_A = rawTrack('A', 'https://img/red', 12_000);
const TRACK_B = rawTrack('B', 'https://img/blue', 200_000);
/** Spotify's API keeps reporting the old track for this long after the audio has moved on. */
const SPOTIFY_LAG_MS = 1_500;

describe('hue music sync loop', () => {
  let dir: string;
  let start: number;
  let paused: boolean;
  let puts: { at: number; id: string; body: HueLightStateBody }[];
  let sync: HueSyncProvider;

  const endOfA = () => start + 10_000; // A starts 2 s in, 12 s long

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start = Date.now();
    paused = false;
    puts = [];
    dir = mkdtempSync(path.join(tmpdir(), 'hue-sync-'));

    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      if (url in COVERS) return new Response(new Uint8Array(COVERS[url]));
      const now = Date.now();
      if (url.endsWith('/me/player/currently-playing')) {
        const onA = now < endOfA() + SPOTIFY_LAG_MS;
        const item = onA ? TRACK_A : TRACK_B;
        const progress = onA ? Math.min(TRACK_A.duration_ms, 2_000 + (now - start)) : now - endOfA();
        return Response.json({ is_playing: !paused, progress_ms: progress, item });
      }
      if (url.endsWith('/me/player/queue')) {
        const onA = now < endOfA() + SPOTIFY_LAG_MS;
        return Response.json({ currently_playing: onA ? TRACK_A : TRACK_B, queue: onA ? [TRACK_B] : [] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const lights: HueLightSnapshot[] = [
      { id: '3', on: true, bri: 200, colormode: 'ct', ct: 366, color: true, ctRange: [153, 500] },
      { id: '4', on: false, bri: 90, colormode: 'xy', xy: [0.4, 0.4], color: true, ctRange: [153, 500] },
    ];
    const hue = {
      isConfigured: () => true,
      getRoomLights: async () => lights,
      putLightState: async (id: string, body: HueLightStateBody) => {
        puts.push({ at: Date.now(), id, body });
      },
    } as unknown as HueProvider;
    const snapshot = { getRateLimitedUntil: async () => 0, setRateLimitedUntil: async () => undefined } as unknown as SpotifySnapshotStore;
    sync = createHueSyncProvider(hue, { clientId: 'x', clientSecret: 'y' }, snapshot, {
      pollMs: 2_500,
      stepMs: 8_000,
      statePath: path.join(dir, 'hue-sync.json'),
    }, () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  const colorPuts = () => puts.filter((put) => put.body.xy !== undefined);
  // A one-color cover yields its color plus a neighbouring hue: red+orange, blue+violet.
  const isRed = ([x]: [number, number]) => x > 0.5;
  const isBlue = ([x, y]: [number, number]) => x < 0.25 && y < 0.15;

  it('follows the album art, switches at the track boundary before Spotify reports it, then restores', async () => {
    await sync.setRoom('83', true);
    // The light that was off comes on; the one already on keeps its brightness.
    expect(puts).toContainEqual(expect.objectContaining({ id: '4', body: { on: true, bri: 180 } }));
    expect(puts.some((put) => put.id === '3' && put.body.on !== undefined)).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    const opening = colorPuts();
    expect(opening).toHaveLength(2);
    expect(opening.every((put) => isRed(put.body.xy!))).toBe(true);
    expect(opening.every((put) => put.body.transitiontime === 4)).toBe(true);
    // Brightness is never driven by the sync once it's running.
    expect(opening.some((put) => put.body.bri !== undefined)).toBe(false);
    expect((await sync.fetch(new AbortController().signal, false)).state).toBe('playing');

    // Mid-song drift: one fade per light per step, as long as the step itself.
    await vi.advanceTimersByTimeAsync(8_000);
    const drift = colorPuts().filter((put) => put.body.transitiontime === 80);
    expect(drift).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(endOfA() - Date.now() + 200);
    const blue = colorPuts().filter((put) => isBlue(put.body.xy!));
    expect(blue.length).toBe(2);
    // The lights moved before the audio ended (lead time) and well before Spotify admitted it.
    expect(blue[0].at).toBeLessThanOrEqual(endOfA());
    expect(blue[0].at).toBeLessThan(endOfA() + SPOTIFY_LAG_MS);

    // Spotify still says "A" for a moment: that must not flip the lights back.
    await vi.advanceTimersByTimeAsync(SPOTIFY_LAG_MS + 2_000);
    const afterConfirm = colorPuts().filter((put) => put.at > endOfA());
    expect(afterConfirm.some((put) => isRed(put.body.xy!))).toBe(false);
    const status = await sync.fetch(new AbortController().signal, false);
    expect(status.track?.id).toBe('B');
    expect(status.palette).toHaveLength(2);

    // Paused: drift stops.
    paused = true;
    await vi.advanceTimersByTimeAsync(3_000);
    const countWhenPaused = puts.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(puts.length).toBe(countWhenPaused);
    expect((await sync.fetch(new AbortController().signal, false)).state).toBe('paused');

    // Off: each light goes back exactly as found, including the one the sync switched on.
    await sync.setRoom('83', false);
    expect(puts.slice(-2).map((put) => put.body)).toEqual(
      expect.arrayContaining([
        { bri: 200, ct: 366, transitiontime: 10 },
        { on: false, transitiontime: 10 },
      ]),
    );
    expect((await sync.fetch(new AbortController().signal, false)).state).toBe('off');
    const settled = puts.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(puts.length).toBe(settled);
  });

  it('lets a room go without restoring it when the user takes the lights over', async () => {
    await sync.setRoom('83', true);
    await vi.advanceTimersByTimeAsync(100);
    const before = puts.length;
    sync.release('83');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(puts.length).toBe(before);
    expect((await sync.fetch(new AbortController().signal, false)).roomIds).toEqual([]);
  });
});
