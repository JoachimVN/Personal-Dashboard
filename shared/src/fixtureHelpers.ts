// Pure, framework-free helpers for building fake/anonymized data — shared by the README
// screenshot generator (server/scripts/screenshotFixtures.ts) and the public demo build
// (client/src/demo/fixtures.ts) so the two don't drift into duplicated RNG/date logic.
import type { AiUsageToolData } from './schemas/aiUsage.js';
import type { HealthDay } from './schemas/health.js';
import type { SpotifyData } from './schemas/spotify.js';

// Seeded PRNG (mulberry32) so "realistic noise" is reproducible between runs, unlike
// Math.random — a smooth Math.sin() wave is what made early trend charts and the
// contribution grid look obviously synthetic (perfectly periodic, no real-world irregularity).
export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = Math.trunc(state);
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function iso(now: Date, hoursFromNow: number): string {
  return new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();
}

export function isoDaysAgo(now: Date, days: number, hoursFromNow = 0): string {
  return new Date(now.getTime() - days * 86_400_000 + hoursFromNow * 3_600_000).toISOString();
}

export function dateDaysAgo(now: Date, days: number): string {
  return isoDaysAgo(now, days).slice(0, 10);
}

export function hhmm(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** A day N days out at a fixed local time — independent of what time the caller happens to run,
 * unlike a relative `iso(hoursFromNow)` offset, which drifts once enough real time has passed. */
export function daysFromNowAt(now: Date, days: number, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── Spotify — a consistent fake persona's rotation, real broadly-recognizable artists/tracks ──

// Display order — deliberately not Object.keys(MANUAL_ARTIST_IMAGES) below, whose own key order
// differs (Coldplay is 4th here but declared 6th there). Reordering this changes rendered artist
// lists, which would spuriously invalidate the committed README screenshots.
export const ARTIST_NAMES = ['The Weeknd', 'Dua Lipa', 'Kendrick Lamar', 'Coldplay', 'Olivia Rodrigo', 'Bruno Mars', 'Billie Eilish', 'Madonna'];

export const MANUAL_ARTIST_IMAGES: Record<string, string> = {
  'The Weeknd': 'https://i.scdn.co/image/ab6761610000e5ebc1719ac9e6a75c1c25835018',
  'Dua Lipa': 'https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d',
  'Kendrick Lamar': 'https://i.scdn.co/image/ab6761610000e5eb39ba6dcd4355c03de0b50918',
  'Olivia Rodrigo': 'https://i.scdn.co/image/ab67616100005174b14eb4dcfd2f3858bed06e44',
  'Billie Eilish': 'https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da',
  Coldplay: 'https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73e7e9313cc6eb',
  'Bruno Mars': 'https://i.scdn.co/image/ab6761610000e5ebc7688aad1bf03986934d7e26',
  Madonna: 'https://i.scdn.co/image/ab6761610000e5ebed2208b41d49ebd24687985b',
};

export const TRACKS = [
  { id: 't1', track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours' },
  { id: 't2', track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia' },
  { id: 't3', track: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.' },
  { id: 't4', track: 'Viva la Vida', artist: 'Coldplay', album: 'Viva la Vida or Death and All His Friends' },
  { id: 't5', track: 'good 4 u', artist: 'Olivia Rodrigo', album: 'SOUR' },
  { id: 't6', track: '24K Magic', artist: 'Bruno Mars', album: '24K Magic' },
  { id: 't7', track: 'bad guy', artist: 'Billie Eilish', album: 'When We All Fall Asleep, Where Do We Go?' },
  { id: 't8', track: 'Vogue', artist: 'Madonna', album: "I'm Breathless" },
];

// A handful of one-off plays outside the top-8 rotation, so "Recently played" reads like actual
// listening history instead of being a reordered copy of "Top tracks".
export const ONE_OFFS = [
  { id: 'r1', track: 'Flowers', artist: 'Miley Cyrus', album: 'Endless Summer Vacation' },
  { id: 'r2', track: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover' },
  { id: 'r3', track: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line' },
];

export const ALBUMS = [
  { id: 'al1', name: 'After Hours', artist: 'The Weeknd', releaseDate: '2020-03-20', totalTracks: 14, totalDurationMs: 3_400_000, playCount: 256, topTrack: TRACKS[0] },
  { id: 'al2', name: 'Future Nostalgia', artist: 'Dua Lipa', releaseDate: '2020-03-27', totalTracks: 11, totalDurationMs: 2_300_000, playCount: 214, topTrack: TRACKS[1] },
  { id: 'al3', name: 'SOUR', artist: 'Olivia Rodrigo', releaseDate: '2021-05-21', totalTracks: 11, totalDurationMs: 2_050_000, playCount: 176, topTrack: TRACKS[4] },
];

/** The fake persona's full "detail"-shaped rotation (now playing, recently played, top
 * artists/tracks, all-time leaderboards) — identical between the README screenshot's Spotify
 * detail page and the public demo's Spotify widget, so it's built once here from whatever
 * artist/album art the caller already resolved (network-fetched for screenshots, static
 * fallback art for the demo — resolution strategy is the only thing that differs). */
export function buildSpotifyRotation(
  now: Date,
  artistImages: Record<string, string>,
  albumImages: Map<string, string>,
): SpotifyData {
  const artists = ARTIST_NAMES.map((name, i) => ({ id: `a${i + 1}`, name, imageUrl: artistImages[name], url: '#', genres: [] as string[] }));
  const tracks = TRACKS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));
  const oneOffs = ONE_OFFS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));

  return {
    nowPlaying: { track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', imageUrl: tracks[1].imageUrl, isPlaying: true, progressMs: 112_000, durationMs: 203_000 },
    recentlyPlayed: [
      { ...tracks[2], playedAt: isoDaysAgo(now, 0, -0.1) },
      { ...oneOffs[0], playedAt: isoDaysAgo(now, 0, -0.6) },
      { ...tracks[6], playedAt: isoDaysAgo(now, 0, -1.4) },
      { ...oneOffs[1], playedAt: isoDaysAgo(now, 0, -2.9) },
      { ...tracks[0], playedAt: isoDaysAgo(now, 0, -4.1) },
      { ...oneOffs[2], playedAt: isoDaysAgo(now, 0, -6.3) },
    ],
    topArtists: { shortTerm: artists, mediumTerm: artists.slice().reverse(), longTerm: artists },
    topTracks: { shortTerm: tracks, mediumTerm: tracks.slice().reverse(), longTerm: tracks },
    allTime: {
      trackedSince: dateDaysAgo(now, 280),
      artists: artists.map((artist, i) => ({ ...artist, playCount: 410 - i * 38 })),
      tracks: tracks.map((track, i) => ({ ...track, playCount: 128 - i * 11, verified: i < 2 })),
      albums: ALBUMS.map((album) => ({
        id: album.id, name: album.name, artist: album.artist, imageUrl: albumImages.get(album.name)!,
        url: '#', releaseDate: album.releaseDate, releaseDatePrecision: 'day' as const, totalTracks: album.totalTracks,
        totalDurationMs: album.totalDurationMs, playCount: album.playCount,
        topTracks: [{ id: album.topTrack.id, track: album.topTrack.track, playCount: Math.round(album.playCount * 0.5), url: '#' }],
      })),
    },
  };
}

// ── Health ───────────────────────────────────────────────────────────────────────────────────

/** One fake day of Apple Health-shaped activity. A stable cyclical pattern, not date.getDay() —
 * coupling this to the real weekday reshuffles the entire RNG sequence (weekend vs. weekday takes
 * a different branch) the moment "today" rolls to a new calendar day, changing the whole chart
 * even when nothing real changed. Rest days, ordinary days and the occasional big-activity day —
 * not a smooth wave; weekends skew a bit lower on average but aren't uniformly quiet. */
export function healthDayFor(now: Date, daysAgo: number, rng: () => number): HealthDay {
  const date = new Date(now.getTime() - daysAgo * 86_400_000);
  const weekend = daysAgo % 7 === 0 || daysAgo % 7 === 1;
  const roll = rng();
  let stepsBase: number;
  if (roll < 0.12) stepsBase = 1800 + rng() * 1800; // rest day
  else if (roll > 0.85) stepsBase = 12500 + rng() * 4000; // big day
  else stepsBase = (weekend ? 5200 : 6800) + rng() * 4200;
  const steps = Math.round(stepsBase);
  const activity = Math.min(1, steps / 12000);
  const resting = Math.round(58 - activity * 4 + (rng() - 0.5) * 4);
  const walking = Math.round(84 + activity * 14 + (rng() - 0.5) * 5);
  return {
    date: date.toISOString().slice(0, 10),
    steps, watchSteps: steps,
    activeEnergyKcal: Math.round(180 + activity * 420 + (rng() - 0.5) * 60),
    exerciseMinutes: Math.round(6 + activity * 40 + (rng() - 0.5) * 8),
    standHours: Math.max(1, Math.round(4 + activity * 9 + (rng() - 0.5) * 2)),
    // Average day-round heart rate sits between resting and walking, weighted toward resting
    // since most of a day is spent well below an active walking pace.
    heartRate: Math.round(resting + (walking - resting) * (0.25 + rng() * 0.15)),
    restingHeartRate: resting,
    walkingHeartRate: walking,
    bloodOxygenPercent: Math.min(100, Math.round(96 + rng() * 3)),
  };
}

// ── AI usage (Claude / Codex) ────────────────────────────────────────────────────────────────

/** Rolling-window usage climbs after each reset and falls back at the next one. Rather than
 * hand-smoothing the drop itself, this leaves a real gap in the data spanning each reset — the
 * client's chart already renders a spacing gap (>3x the median step) as a dashed line instead of
 * a solid one, exactly the "this just reset" signal a real dashboard shows during a sampling gap,
 * and cleaner than an artificial vertical line ever looks. */
export interface SawtoothHistoryOptions {
  resetsAtIso: string;
  periodMs: number;
  spanMs: number;
  stepMs: number;
  peakRange: [number, number];
  rng: () => number;
  field: 'fiveHourUsedPercent' | 'weeklyUsedPercent';
  gapSteps: number;
  now: number;
}

export function sawtoothHistory({
  resetsAtIso,
  periodMs,
  spanMs,
  stepMs,
  peakRange,
  rng,
  field,
  gapSteps,
  now,
}: SawtoothHistoryOptions): AiUsageToolData['history'] {
  const resetsAt = Date.parse(resetsAtIso);
  const peaks = new Map<number, number>();
  const peakFor = (cycle: number) => {
    if (!peaks.has(cycle)) peaks.set(cycle, peakRange[0] + rng() * (peakRange[1] - peakRange[0]));
    return peaks.get(cycle)!;
  };
  const points: AiUsageToolData['history'] = [];
  for (let t = now - spanMs; t <= now; t += stepMs) {
    const cycle = Math.ceil((resetsAt - t) / periodMs);
    const lastReset = resetsAt - cycle * periodMs;
    const msIntoWindow = t - lastReset;
    if (msIntoWindow < gapSteps * stepMs) continue;
    const fraction = Math.min(1, msIntoWindow / periodMs);
    const percent = Math.max(0, Math.min(100, fraction * peakFor(cycle) + (rng() - 0.5) * 3));
    points.push({ at: new Date(t).toISOString(), [field]: Math.round(percent) });
  }
  return points;
}

export function usageHistoryFor(
  fiveHour: { usedPercent: number; resetsAt: string },
  weekly: { usedPercent: number; resetsAt: string },
  seed: number,
  now: number,
): AiUsageToolData['history'] {
  const rng = mulberry32(seed);
  const fiveHourPoints = sawtoothHistory({
    resetsAtIso: fiveHour.resetsAt, periodMs: 5 * 3_600_000, spanMs: 24 * 3_600_000,
    stepMs: 15 * 60_000, peakRange: [fiveHour.usedPercent * 0.6, Math.min(100, fiveHour.usedPercent * 1.15)],
    rng, field: 'fiveHourUsedPercent', gapSteps: 4, now,
  });
  const weeklyPoints = sawtoothHistory({
    resetsAtIso: weekly.resetsAt, periodMs: 7 * 86_400_000, spanMs: 7 * 86_400_000,
    stepMs: 3 * 3_600_000, peakRange: [weekly.usedPercent * 0.5, Math.min(100, weekly.usedPercent * 1.1)],
    rng, field: 'weeklyUsedPercent', gapSteps: 4, now,
  });
  return [...fiveHourPoints, ...weeklyPoints].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
