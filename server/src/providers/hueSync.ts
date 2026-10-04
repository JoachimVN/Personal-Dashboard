import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { hueSyncDataSchema, type HueSyncData, type HueSyncState } from '@personal-dashboard/shared';
import { FALLBACK_PALETTE, fetchAlbumPalette, type LampColor } from '../albumPalette.js';
import type { SpotifySnapshotStore } from '../spotifyCache.js';
import { readSpotifyToken } from '../spotifyToken.js';
import type { Provider } from '../scheduler.js';
import {
  HueBridgeError,
  HueHttpError,
  type HueLightSnapshot,
  type HueLightStateBody,
  type HueProvider,
} from './hue.js';
import { accessToken } from './spotify.js';

/**
 * Hue music sync: lights in the chosen rooms take their colors from the album cover of whatever
 * Spotify is playing, and keep drifting between those colors for the length of the song.
 *
 * Timing is the whole point, so the loop is built around the track boundary:
 * - Spotify is polled every `pollMs` while playing (manual skips can only be seen by polling),
 *   and additionally right at the predicted end of the current track.
 * - The next track in Spotify's queue has its palette computed ahead of time, and the lights
 *   switch to it at the predicted end *without* waiting for Spotify's API to catch up (it lags a
 *   second or two behind the actual change). The next poll confirms or corrects the guess.
 * - Mid-song motion costs one request per light per `stepMs`: each step sends the next color with
 *   a transition as long as the step itself, so the bridge fades continuously between commands.
 *
 * Brightness is deliberately left to the user during a sync — only chromaticity is driven, so
 * dimming a synced light from the dashboard or the Hue app sticks.
 */

export const HUE_SYNC_PROVIDER_ID = 'hue-sync';

const SPOTIFY_API = 'https://api.spotify.com/v1';
/** How long a predicted track change is trusted while Spotify still reports the previous track. */
const PREDICTION_GRACE_MS = 5_000;
/** Switch the lights this far ahead of the predicted end, covering the cloud round trip. */
const PREDICTION_LEAD_MS = 300;
/** Poll this soon after a predicted end, to confirm the change quickly. */
const END_CONFIRM_MS = 400;
const MIN_POLL_MS = 700;
/** A new track snaps in fast — a fade, not a cut — instead of drifting in over a full step. */
const TRACK_CHANGE_TRANSITION_MS = 400;
/** Brightness (1-254) for lights that were off when the sync started. */
const DEFAULT_BRI = 180;
const RESTORE_TRANSITION_MS = 1_000;
const HUE_RATE_LIMIT_BACKOFF_MS = 30_000;
const SPOTIFY_FAILURE_RETRY_MS = 10_000;
/** Nothing playing for a while: poll less, so a sync left on overnight costs next to nothing. */
const IDLE_BACKOFF = [
  { afterMs: 60 * 60_000, pollMs: 60_000 },
  { afterMs: 5 * 60_000, pollMs: 15_000 },
] as const;

export interface HueSyncOptions {
  pollMs: number;
  stepMs: number;
  /** Where syncing rooms are remembered across restarts; defaults to `server/.data/hue-sync.json`. */
  statePath?: string;
}

export interface HueSyncProvider extends Provider<HueSyncData> {
  /** Starts or stops the sync for a room. Stopping restores the lights to how they were. */
  setRoom(roomId: string, on: boolean): Promise<void>;
  /** Drops a room without restoring it — the user took the lights over (turned off, scene). */
  release(roomId: string): void;
  /** Picks up rooms that were syncing when the server last stopped. */
  resume(): void;
  onChange(listener: () => void): void;
}

interface TrackInfo {
  id: string;
  name: string;
  artist: string;
  imageUrl?: string;
  /** Smallest cover (64 px) — plenty for a palette, and the fastest to download. */
  coverUrl?: string;
}

interface Playback {
  track: TrackInfo;
  isPlaying: boolean;
  remainingMs: number;
}

interface RoomSession {
  lights: HueLightSnapshot[];
}

// Only the fields read here.
const rawTrackSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  artists: z.array(z.object({ name: z.string() })).default([]),
  album: z.object({ images: z.array(z.object({ url: z.string() })).default([]) }).optional(),
});
const currentlyPlayingSchema = z.object({
  is_playing: z.boolean(),
  progress_ms: z.number().nullable(),
  item: rawTrackSchema.extend({ duration_ms: z.number() }).nullable(),
});
const queueSchema = z.object({
  currently_playing: rawTrackSchema.nullable(),
  queue: z.array(z.unknown()),
});
const persistedSchema = z.object({
  rooms: z.record(
    z.string(),
    z.array(
      z.object({
        id: z.string(),
        on: z.boolean(),
        bri: z.number().optional(),
        colormode: z.enum(['xy', 'ct', 'hs']).optional(),
        xy: z.tuple([z.number(), z.number()]).optional(),
        ct: z.number().optional(),
        hue: z.number().optional(),
        sat: z.number().optional(),
        color: z.boolean(),
        ctRange: z.tuple([z.number(), z.number()]).optional(),
      }),
    ),
  ),
});

class SpotifyCooldown extends Error {}

function toTrackInfo(raw: z.infer<typeof rawTrackSchema>): TrackInfo | undefined {
  if (!raw.id) return undefined; // local files have no id to follow
  const images = raw.album?.images ?? [];
  return {
    id: raw.id,
    name: raw.name,
    artist: raw.artists.map((artist) => artist.name).join(', '),
    imageUrl: (images[1] ?? images[0])?.url,
    coverUrl: images.at(-1)?.url,
  };
}

/**
 * Which palette color each light in a room shows at a given step. Lights are spread across the
 * palette so neighbours never match (the two sides of a sink, a desk strip against the wall
 * behind it), and every step moves each light one color along, so over a song every light
 * visits every color.
 */
export function assignColors(palette: LampColor[], lightCount: number, step: number): LampColor[] {
  if (palette.length === 0) return [];
  const spacing = Math.max(1, Math.floor(palette.length / Math.max(1, lightCount)));
  return Array.from({ length: lightCount }, (_, i) => palette[(step + i * spacing) % palette.length]);
}

/** Correlated color temperature (McCamy) of a chromaticity, as mirek clamped to a light's range. */
export function mirekForXy([x, y]: [number, number], [min, max]: [number, number]): number {
  const n = (x - 0.332) / (0.1858 - y);
  const kelvin = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
  const mirek = Number.isFinite(kelvin) && kelvin > 0 ? 1_000_000 / kelvin : max;
  return Math.round(Math.min(max, Math.max(min, mirek)));
}

/** The state body that puts a color on one light, or undefined for a light with no color control. */
export function colorBody(light: HueLightSnapshot, color: LampColor, transitionMs: number): HueLightStateBody | undefined {
  const transitiontime = Math.round(transitionMs / 100);
  if (light.color) return { xy: color.xy, transitiontime };
  if (light.ctRange) return { ct: mirekForXy(color.xy, light.ctRange), transitiontime };
  return undefined;
}

/** Puts a light back the way the sync found it — color mode, brightness, and on/off. */
export function restoreBody(saved: HueLightSnapshot): HueLightStateBody {
  const body: HueLightStateBody = { transitiontime: Math.round(RESTORE_TRANSITION_MS / 100) };
  if (!saved.on) return { ...body, on: false };
  if (saved.bri !== undefined) body.bri = saved.bri;
  if (saved.colormode === 'xy' && saved.xy) body.xy = saved.xy;
  else if (saved.colormode === 'ct' && saved.ct !== undefined) body.ct = saved.ct;
  else if (saved.colormode === 'hs' && saved.hue !== undefined && saved.sat !== undefined) {
    body.hue = saved.hue;
    body.sat = saved.sat;
  }
  return body;
}

/** Next Spotify poll: at the predicted end of the track if that comes first, backing off when idle. */
export function nextPollDelay(playback: Playback | null, idleForMs: number, pollMs: number): number {
  if (playback?.isPlaying) {
    return Math.min(pollMs, Math.max(MIN_POLL_MS, playback.remainingMs + END_CONFIRM_MS));
  }
  return IDLE_BACKOFF.find((tier) => idleForMs >= tier.afterMs)?.pollMs ?? pollMs;
}

function isLightOff(error: unknown): boolean {
  return error instanceof HueBridgeError && error.type === 201;
}

export function createHueSyncProvider(
  hue: HueProvider,
  spotifyOauth: { clientId: string; clientSecret: string } | undefined,
  spotifySnapshot: SpotifySnapshotStore,
  options: HueSyncOptions,
  isHueEnabled: () => boolean,
): HueSyncProvider {
  const statePath =
    options.statePath ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data/hue-sync.json');
  const sessions = new Map<string, RoomSession>();
  const listeners = new Set<() => void>();

  let state: HueSyncState = 'off';
  let problem: string | null = null;
  let track: TrackInfo | null = null;
  let palette: LampColor[] = [];
  let isPlaying = false;
  let step = 0;
  let idleSince = Date.now();
  let upcoming: { forTrackId: string; track: TrackInfo; palette: LampColor[] } | undefined;
  let upcomingFetchedFor: string | undefined;
  let predicted: { previousId: string; at: number } | undefined;
  let spotifyBlockedUntil = 0;
  let hueBlockedUntil = 0;
  let pollTimer: NodeJS.Timeout | undefined;
  let driftTimer: NodeJS.Timeout | undefined;
  let predictTimer: NodeJS.Timeout | undefined;
  let pollInFlight = false;
  /** Bumped whenever the last room stops, so work already in flight can't restart the loop. */
  let generation = 0;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const setStatus = (nextState: HueSyncState, nextProblem: string | null = problem) => {
    if (nextState === state && nextProblem === problem) return;
    state = nextState;
    problem = nextProblem;
    notify();
  };

  /** A successful poll clears a Spotify problem, but a Hue one is only cleared by working lights. */
  const withoutSpotifyProblem = () => (problem?.startsWith('spotify-') ? null : problem);

  const persist = () => {
    try {
      mkdirSync(path.dirname(statePath), { recursive: true });
      const rooms = Object.fromEntries([...sessions].map(([roomId, session]) => [roomId, session.lights]));
      writeFileSync(statePath, JSON.stringify({ rooms }, null, 2));
    } catch (error) {
      console.error('[hue-sync] could not save sync state:', error);
    }
  };

  // ---- Spotify ----

  async function spotifyGet(pathname: string): Promise<unknown> {
    if (!spotifyOauth) throw new Error('spotify is not configured');
    if (Date.now() < spotifyBlockedUntil) throw new SpotifyCooldown();
    const signal = AbortSignal.timeout(8_000);
    const request = async (forceRefresh: boolean) =>
      fetch(`${SPOTIFY_API}${pathname}`, {
        headers: { Authorization: `Bearer ${await accessToken(spotifyOauth, signal, forceRefresh)}` },
        signal,
      });
    let res = await request(false);
    if (res.status === 401) res = await request(true);
    if (res.status === 204) return null;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      spotifyBlockedUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000);
      // Shared with the Spotify widget (and the other dashboard) so nobody keeps hammering.
      void spotifySnapshot.setRateLimitedUntil(spotifyBlockedUntil).catch(() => undefined);
      throw new SpotifyCooldown();
    }
    if (!res.ok) throw new Error(`spotify ${pathname} failed: ${res.status}`);
    return res.json();
  }

  async function fetchPlayback(): Promise<Playback | null> {
    const raw = await spotifyGet('/me/player/currently-playing');
    if (!raw) return null;
    const current = currentlyPlayingSchema.parse(raw);
    const trackInfo = current.item ? toTrackInfo(current.item) : undefined;
    if (!current.item || !trackInfo) return null;
    return {
      track: trackInfo,
      isPlaying: current.is_playing,
      remainingMs: Math.max(0, current.item.duration_ms - (current.progress_ms ?? 0)),
    };
  }

  async function paletteFor(trackInfo: TrackInfo): Promise<LampColor[]> {
    if (!trackInfo.coverUrl) return FALLBACK_PALETTE;
    try {
      return await fetchAlbumPalette(trackInfo.coverUrl, AbortSignal.timeout(5_000));
    } catch {
      return FALLBACK_PALETTE;
    }
  }

  /** Looks one track ahead in Spotify's queue so the switch at the track boundary is instant. */
  async function prefetchUpcoming(currentId: string): Promise<void> {
    upcomingFetchedFor = currentId;
    try {
      const queue = queueSchema.parse(await spotifyGet('/me/player/queue'));
      if (queue.currently_playing?.id !== currentId) return;
      const next = queue.queue[0] === undefined ? undefined : rawTrackSchema.safeParse(queue.queue[0]);
      const nextTrack = next?.success ? toTrackInfo(next.data) : undefined;
      // Repeat-one queues the same track again: nothing will change, so there's nothing to predict.
      if (!nextTrack || nextTrack.id === currentId) return;
      upcoming = { forTrackId: currentId, track: nextTrack, palette: await paletteFor(nextTrack) };
    } catch {
      // Best effort: without a prediction the change is still caught by the poll at track end.
    }
  }

  // ---- Lights ----

  async function applyColors(transitionMs: number, only?: RoomSession[]): Promise<void> {
    if (Date.now() < hueBlockedUntil || palette.length === 0) return;
    const requests: Promise<void>[] = [];
    for (const session of only ?? sessions.values()) {
      const colors = assignColors(palette, session.lights.length, step);
      session.lights.forEach((light, i) => {
        const body = colorBody(light, colors[i], transitionMs);
        if (body) requests.push(hue.putLightState(light.id, body, AbortSignal.timeout(8_000)));
      });
    }
    const failures = (await Promise.allSettled(requests))
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown)
      .filter((reason) => !isLightOff(reason)); // someone switched a light off — leave it be
    if (failures.length === 0) {
      if (problem?.startsWith('hue-')) setStatus(state, null);
      return;
    }
    if (failures.some((reason) => reason instanceof HueHttpError && reason.status === 429)) {
      hueBlockedUntil = Date.now() + HUE_RATE_LIMIT_BACKOFF_MS;
      setStatus(state, 'hue-rate-limited');
    } else {
      setStatus(state, 'hue-unreachable');
    }
    const first = failures[0];
    console.error(`[hue-sync] light update failed (${first instanceof Error ? first.message : 'unknown'})`);
  }

  async function showTrack(next: TrackInfo, nextPalette: LampColor[]): Promise<void> {
    track = next;
    palette = nextPalette;
    step = 0;
    stopDrift();
    notify();
    await applyColors(TRACK_CHANGE_TRANSITION_MS);
    startDrift();
  }

  function stopDrift() {
    clearTimeout(driftTimer);
    driftTimer = undefined;
  }

  function startDrift() {
    if (driftTimer || !isPlaying || sessions.size === 0) return;
    driftTimer = setTimeout(() => {
      driftTimer = undefined;
      if (!isPlaying || sessions.size === 0) return;
      step++;
      void applyColors(options.stepMs).finally(startDrift);
    }, options.stepMs);
    driftTimer.unref?.();
  }

  function schedulePrediction(playback: Playback) {
    clearTimeout(predictTimer);
    predictTimer = undefined;
    const next = upcoming;
    if (!playback.isPlaying || next?.forTrackId !== playback.track.id) return;
    // Only arm it for the last stretch; a longer timer would miss pauses and seeks in between.
    if (playback.remainingMs > options.pollMs + END_CONFIRM_MS) return;
    predictTimer = setTimeout(() => {
      predictTimer = undefined;
      if (track?.id !== next.forTrackId || !isPlaying) return;
      predicted = { previousId: next.forTrackId, at: Date.now() };
      upcoming = undefined;
      void showTrack(next.track, next.palette);
    }, Math.max(0, playback.remainingMs - PREDICTION_LEAD_MS));
    predictTimer.unref?.();
  }

  // ---- Poll loop ----

  async function onPlayback(playback: Playback | null): Promise<number> {
    const now = Date.now();
    if (!playback) {
      if (isPlaying || state === 'starting') idleSince = now;
      isPlaying = false;
      stopDrift();
      setStatus('nothing-playing', withoutSpotifyProblem());
      return nextPollDelay(null, now - idleSince, options.pollMs);
    }
    // The lights already moved on to a predicted track; Spotify just hasn't caught up yet.
    if (playback.track.id === predicted?.previousId && now - predicted.at < PREDICTION_GRACE_MS) {
      return MIN_POLL_MS;
    }
    predicted = undefined;

    // Idle time counts from the moment playback stopped.
    if (isPlaying || playback.isPlaying) idleSince = now;
    isPlaying = playback.isPlaying;

    if (playback.track.id !== track?.id) {
      upcoming = undefined;
      await showTrack(playback.track, await paletteFor(playback.track));
    }
    if (upcomingFetchedFor !== playback.track.id) void prefetchUpcoming(playback.track.id);

    if (isPlaying) startDrift();
    else stopDrift();
    setStatus(isPlaying ? 'playing' : 'paused', withoutSpotifyProblem());
    schedulePrediction(playback);
    return nextPollDelay(playback, now - idleSince, options.pollMs);
  }

  function schedulePoll(delayMs: number) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void poll(), delayMs);
    pollTimer.unref?.();
  }

  async function poll(): Promise<void> {
    if (pollInFlight || sessions.size === 0) return;
    pollInFlight = true;
    const run = generation;
    let delay = options.pollMs;
    try {
      const playback = await fetchPlayback();
      if (run !== generation) return;
      delay = await onPlayback(playback);
    } catch (error) {
      if (error instanceof SpotifyCooldown) {
        setStatus(state, 'spotify-rate-limited');
        delay = Math.max(options.pollMs, spotifyBlockedUntil - Date.now());
      } else {
        setStatus(state, 'spotify-unreachable');
        delay = SPOTIFY_FAILURE_RETRY_MS;
        // Only the message: it names the path and status, never a token or response body.
        console.error(`[hue-sync] spotify poll failed (${error instanceof Error ? error.message : 'unknown'})`);
      }
    } finally {
      pollInFlight = false;
    }
    if (run === generation && sessions.size > 0) schedulePoll(delay);
  }

  function stopAll() {
    generation++;
    clearTimeout(pollTimer);
    clearTimeout(predictTimer);
    stopDrift();
    pollTimer = predictTimer = undefined;
    track = null;
    palette = [];
    isPlaying = false;
    upcoming = undefined;
    upcomingFetchedFor = undefined;
    predicted = undefined;
    setStatus('off', null);
  }

  async function beginLoop() {
    if (pollTimer || pollInFlight) return;
    setStatus('starting', null);
    // Respect a cooldown the Spotify widget (or the other dashboard) already ran into.
    spotifyBlockedUntil = Math.max(spotifyBlockedUntil, await spotifySnapshot.getRateLimitedUntil().catch(() => 0));
    schedulePoll(0);
  }

  return {
    id: HUE_SYNC_PROVIDER_ID,
    schema: hueSyncDataSchema,
    // Pushed on every change via onChange; this is just the idle re-read.
    refreshMs: 60_000,
    timeoutMs: 5_000,
    isConfigured: () => isHueEnabled() && hue.isConfigured() && spotifyOauth !== undefined && readSpotifyToken() !== undefined,
    fetch(): Promise<HueSyncData> {
      return Promise.resolve({
        roomIds: [...sessions.keys()],
        state,
        track: track ? { id: track.id, name: track.name, artist: track.artist, imageUrl: track.imageUrl } : null,
        palette: palette.map((color) => color.hex),
        problem,
      });
    },

    async setRoom(roomId, on): Promise<void> {
      if (!on) {
        const session = sessions.get(roomId);
        if (!session) return;
        sessions.delete(roomId);
        persist();
        if (sessions.size === 0) stopAll();
        else notify();
        await Promise.allSettled(
          session.lights.map((light) => hue.putLightState(light.id, restoreBody(light), AbortSignal.timeout(8_000))),
        );
        return;
      }

      if (sessions.has(roomId)) return;
      const lights = await hue.getRoomLights(roomId, AbortSignal.timeout(10_000));
      const session: RoomSession = { lights };
      const wasIdle = sessions.size === 0;
      sessions.set(roomId, session);
      persist();
      // Lights that were off come on; lights already on keep the brightness they had.
      await Promise.allSettled(
        lights
          .filter((light) => !light.on)
          .map((light) => hue.putLightState(light.id, { on: true, bri: DEFAULT_BRI }, AbortSignal.timeout(8_000))),
      );
      if (track) await applyColors(TRACK_CHANGE_TRANSITION_MS, [session]);
      notify();
      if (wasIdle) await beginLoop();
    },

    release(roomId) {
      if (!sessions.delete(roomId)) return;
      persist();
      if (sessions.size === 0) stopAll();
      else notify();
    },

    resume() {
      let saved: z.infer<typeof persistedSchema>;
      try {
        saved = persistedSchema.parse(JSON.parse(readFileSync(statePath, 'utf8')));
      } catch {
        return; // nothing was syncing (or the file is unreadable) — start clean
      }
      for (const [roomId, lights] of Object.entries(saved.rooms)) sessions.set(roomId, { lights });
      if (sessions.size > 0) void beginLoop();
    },

    onChange(listener) {
      listeners.add(listener);
    },
  };
}
