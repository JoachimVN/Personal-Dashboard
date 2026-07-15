// Fake, fully-anonymized data for the README screenshot workflow (see screenshots.ts). One
// consistent fake persona across all 5 pages — no real names, places, or events from the actual
// dashboard owner. Command-center ranking still runs through the real scoring functions in
// ../src/importance/sources.ts so that page's output reflects actual behavior, not a hand-picked
// result. Track/album art comes from the iTunes Search API and artist photos from Wikipedia's
// summary API — both free, unauthenticated, and meant for exactly this kind of lookup — so the
// Spotify page shows real cover art instead of generic stock photos.
import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  HealthData,
  SpotifyData,
  WeatherData,
} from '@personal-dashboard/shared';

// Seeded PRNG (mulberry32) so "realistic noise" is still reproducible between runs, unlike
// Math.random — a smooth Math.sin() wave is what made the original trend charts and contribution
// grid look obviously synthetic (perfectly periodic, no real-world irregularity).
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = Math.trunc(state);
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every one of these takes an explicit `now` rather than reading Date.now()/`new Date()` — the
// script can run at any real wall-clock moment, but the client renders relative-time text
// ("2 h ago", contribution grid dates) against a *frozen* fake clock (see referenceNow in
// screenshots.ts). Computing fixture timestamps off the real clock instead of that same frozen
// reference meant every CI run — even with zero source changes — nudged "11 h ago" to "10 h ago"
// and produced a spurious screenshot commit purely from wall-clock drift.
function iso(now: Date, hoursFromNow: number): string {
  return new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();
}

function isoDaysAgo(now: Date, days: number, hoursFromNow = 0): string {
  return new Date(now.getTime() - days * 86_400_000 + hoursFromNow * 3_600_000).toISOString();
}

function dateDaysAgo(now: Date, days: number): string {
  return isoDaysAgo(now, days).slice(0, 10);
}

function hhmm(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** A day N days out at a fixed local time — independent of what time the screenshot script
 * happens to run, unlike a relative `iso(hoursFromNow)` offset, which drifted into an "in 4h"
 * label that no longer matched a hardcoded "19:15" string once enough real time had passed. */
function daysFromNowAt(now: Date, days: number, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── Real art lookups ─────────────────────────────────────────────────────────────────────────

const artCache = new Map<string, Promise<string | undefined>>();
const fallbackArt = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': 'personal-dashboard-screenshot-script' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Real cover art via the iTunes Search API (free, unauthenticated, built for exactly this).
 * Looked up by *album*, not track — searching by track name can return a single's own promo
 * artwork instead of the album cover a real music app would actually show for that track. */
function albumArt(album: string, artist: string): Promise<string | undefined> {
  const key = `album:${album}|${artist}`;
  const searchTerm = encodeURIComponent([album, artist].join(' '));
  if (!artCache.has(key)) {
    artCache.set(key, fetchJson(
      `https://itunes.apple.com/search?term=${searchTerm}&media=music&entity=album&limit=1`,
    ).then((data) => data.results?.[0]?.artworkUrl100?.replace('100x100', '600x600')).catch(() => undefined));
  }
  return artCache.get(key)!;
}

/** Real artist photo via Wikipedia's page-summary API (free, unauthenticated, CC-licensed thumbnails). */
function artistPhoto(name: string): Promise<string | undefined> {
  const key = `artist:${name}`;
  if (!artCache.has(key)) {
    artCache.set(key, fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`)
      .then((data) => data.thumbnail?.source).catch(() => undefined));
  }
  return artCache.get(key)!;
}

async function resolvedAlbumArt(album: string, artist: string, fallbackSeed: string): Promise<string> {
  return (await albumArt(album, artist)) ?? fallbackArt(fallbackSeed);
}

async function resolvedArtistPhoto(name: string, fallbackSeed: string): Promise<string> {
  return (await artistPhoto(name)) ?? fallbackArt(fallbackSeed);
}

// ── Overview page (calendar + weather + a quiet day of tiles) ──────────────────────────────────

export function weather(now: Date): WeatherData {
  return {
    location: { lat: 40.71, lon: -74.01, name: 'New York' },
    current: { temperature: 18, windSpeed: 2.6, symbol: 'partlycloudy_day' },
    hours: [
      { time: iso(now, 1), hourLabel: '14', temperature: 18, precipitationMm: 0, symbol: 'partlycloudy_day' },
      { time: iso(now, 2), hourLabel: '15', temperature: 19, precipitationMm: 0, symbol: 'clearsky_day' },
      { time: iso(now, 3), hourLabel: '16', temperature: 17, precipitationMm: 0, symbol: 'fair_day' },
      { time: iso(now, 4), hourLabel: '17', temperature: 16, precipitationMm: 0.1, symbol: 'lightrain' },
    ],
    days: [
      { date: dateDaysAgo(now, 0), dayLabel: 'Wed', minTemperature: 14, maxTemperature: 20, precipitationMm: 0.4, symbol: 'partlycloudy_day' },
    ],
  };
}

export function overviewCalendar(now: Date): CalendarData {
  const odysseyStart = daysFromNowAt(now, 2, 19, 15); // Friday
  const ODYSSEY_DURATION_MIN = 2 * 60 + 53;
  const odysseyEnd = new Date(odysseyStart.getTime() + ODYSSEY_DURATION_MIN * 60_000);
  const odysseyDurationLabel = `${Math.floor(ODYSSEY_DURATION_MIN / 60)}h ${ODYSSEY_DURATION_MIN % 60}m`;
  const standupStart = daysFromNowAt(now, 1, 9, 30);
  const standupEnd = new Date(standupStart.getTime() + 30 * 60_000);

  return {
    events: [
      {
        id: 'ev1', title: 'Cinema — The Odyssey', calendar: 'Personal', allDay: false,
        location: `${odysseyDurationLabel} · with Sam`, start: odysseyStart.toISOString(), end: odysseyEnd.toISOString(),
        date: odysseyStart.toISOString().slice(0, 10), startLabel: hhmm(odysseyStart), endLabel: hhmm(odysseyEnd),
      },
      {
        id: 'ev2', title: 'Team standup', calendar: 'Work', allDay: false, location: 'Video call',
        start: standupStart.toISOString(), end: standupEnd.toISOString(),
        date: standupStart.toISOString().slice(0, 10), startLabel: hhmm(standupStart), endLabel: hhmm(standupEnd),
      },
    ],
  };
}

export function overviewGithub(now: Date): GitHubData {
  return {
    activity: [], issues: [],
    pullRequests: [
      { title: 'Add importance scoring to the command center', repo: 'yourname/personal-dashboard', number: 42, url: '#', role: 'author', draft: false, updatedAt: iso(now, -2) },
    ],
    contributions: { total: 512, days: [{ date: dateDaysAgo(now, 0), count: 2 }] },
    repoHealth: [],
  };
}

export function overviewGmail(now: Date): GmailData {
  return {
    unreadThreads: 5,
    threads: [{ id: 't1', from: 'Newsletter', subject: 'This week in open source', date: iso(now, -3), unread: true, url: '#' }],
  };
}

export function overviewHealth(now: Date): HealthData {
  return {
    today: {
      date: dateDaysAgo(now, 0), steps: 3247, watchSteps: 3247, activeEnergyKcal: 214, exerciseMinutes: 14,
      standHours: 7, heartRate: 71, restingHeartRate: 59, walkingHeartRate: 89, bloodOxygenPercent: 98,
    },
    history: [], updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
  };
}

export function overviewAiClaude(now: Date): AiUsageToolData {
  return {
    available: true, fiveHour: { usedPercent: 28, resetsAt: iso(now, 3) }, weekly: { usedPercent: 37, resetsAt: iso(now, 96) },
    fiveHourStatus: 'limited', weeklyStatus: 'limited', history: [],
  };
}
export function overviewAiCodex(now: Date): AiUsageToolData {
  return {
    available: true, fiveHour: { usedPercent: 15, resetsAt: iso(now, 3) }, weekly: { usedPercent: 22, resetsAt: iso(now, 96) },
    fiveHourStatus: 'limited', weeklyStatus: 'limited', history: [],
  };
}

// ── Spotify page — real, broadly-recognizable artists/tracks, not an obscure curated list ──────

const ARTIST_NAMES = ['The Weeknd', 'Dua Lipa', 'Kendrick Lamar', 'Coldplay', 'Olivia Rodrigo', 'Bruno Mars', 'Billie Eilish', 'Madonna'];

// Manual overrides, checked before the automatic Wikipedia/iTunes lookups — fill in when the
// automatic result is wrong (mismatched photo, low-res crop, etc.). Same keys as ARTIST_NAMES /
// track names / album names above.
const MANUAL_ARTIST_IMAGES: Record<string, string> = {
  'The Weeknd': 'https://i.scdn.co/image/ab6761610000e5ebc1719ac9e6a75c1c25835018',
  'Dua Lipa': 'https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d',
  'Kendrick Lamar': 'https://i.scdn.co/image/ab6761610000e5eb39ba6dcd4355c03de0b50918',
  'Olivia Rodrigo': 'https://i.scdn.co/image/ab67616100005174b14eb4dcfd2f3858bed06e44',
  'Billie Eilish': 'https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da',
  Coldplay: 'https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73e7e9313cc6eb',
  'Bruno Mars': 'https://i.scdn.co/image/ab6761610000e5ebc7688aad1bf03986934d7e26',
  Madonna: 'https://i.scdn.co/image/ab6761610000e5ebed2208b41d49ebd24687985b',
};
const MANUAL_ALBUM_IMAGES: Record<string, string> = {};

const TRACKS = [
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
const ONE_OFFS = [
  { id: 'r1', track: 'Flowers', artist: 'Miley Cyrus', album: 'Endless Summer Vacation' },
  { id: 'r2', track: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover' },
  { id: 'r3', track: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line' },
];

const ALBUMS = [
  { id: 'al1', name: 'After Hours', artist: 'The Weeknd', releaseDate: '2020-03-20', totalTracks: 14, totalDurationMs: 3_400_000, playCount: 256, topTrack: TRACKS[0] },
  { id: 'al2', name: 'Future Nostalgia', artist: 'Dua Lipa', releaseDate: '2020-03-27', totalTracks: 11, totalDurationMs: 2_300_000, playCount: 214, topTrack: TRACKS[1] },
  { id: 'al3', name: 'SOUR', artist: 'Olivia Rodrigo', releaseDate: '2021-05-21', totalTracks: 11, totalDurationMs: 2_050_000, playCount: 176, topTrack: TRACKS[4] },
];

async function loadSpotify(now: Date): Promise<{ overview: SpotifyData; detail: SpotifyData }> {
  const artistImages = Object.fromEntries(await Promise.all(
    ARTIST_NAMES.map(async (name) => [name, MANUAL_ARTIST_IMAGES[name] ?? await resolvedArtistPhoto(name, `artist-${name}`)] as const),
  ));
  // Keyed by album, not track — every track on the same album shares its cover, same as a real
  // music app, and searching by album avoids a single's own promo artwork drifting from the
  // actual album cover.
  const albumImages = new Map<string, string>();
  for (const t of [...TRACKS, ...ONE_OFFS]) {
    if (!albumImages.has(t.album)) {
      albumImages.set(t.album, MANUAL_ALBUM_IMAGES[t.album] ?? await resolvedAlbumArt(t.album, t.artist, t.album));
    }
  }

  const artists = ARTIST_NAMES.map((name, i) => ({ id: `a${i + 1}`, name, imageUrl: artistImages[name], url: '#', genres: [] as string[] }));
  const tracks = TRACKS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));
  const oneOffs = ONE_OFFS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));

  const overview: SpotifyData = {
    nowPlaying: { track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', imageUrl: tracks[0].imageUrl, isPlaying: true, progressMs: 58_000, durationMs: 200_000 },
    recentlyPlayed: [], topArtists: { shortTerm: [], mediumTerm: [] }, topTracks: { shortTerm: [], mediumTerm: [] },
    allTime: { artists: [], tracks: [], albums: [] },
  };

  const detail: SpotifyData = {
    nowPlaying: { track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', imageUrl: tracks[1].imageUrl, isPlaying: true, progressMs: 112_000, durationMs: 203_000 },
    recentlyPlayed: [
      { ...tracks[2], playedAt: isoDaysAgo(now, 0, -0.1) },
      { ...oneOffs[0], playedAt: isoDaysAgo(now, 0, -0.6) },
      { ...tracks[6], playedAt: isoDaysAgo(now, 0, -1.4) },
      { ...oneOffs[1], playedAt: isoDaysAgo(now, 0, -2.9) },
      { ...tracks[0], playedAt: isoDaysAgo(now, 0, -4.1) },
      { ...oneOffs[2], playedAt: isoDaysAgo(now, 0, -6.3) },
    ],
    topArtists: { shortTerm: artists, mediumTerm: artists.slice().reverse() },
    topTracks: { shortTerm: tracks, mediumTerm: tracks.slice().reverse() },
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

  return { overview, detail };
}

// ── Health page ──────────────────────────────────────────────────────────────────────────────

function healthDayFor(now: Date, daysAgo: number, rng: () => number) {
  const date = new Date(now.getTime() - daysAgo * 86_400_000);
  // A stable cyclical pattern, not date.getDay() — real weekday drifts by one position every time
  // this script runs on a different calendar day, which reshuffled the *entire* RNG sequence
  // below (weekend vs. weekday takes a different branch) and made the chart change on every run
  // regardless of whether anything actually changed.
  const weekend = daysAgo % 7 === 0 || daysAgo % 7 === 1;
  const roll = rng();
  // A real month has rest days, ordinary days, and the occasional big-activity day — not a
  // smooth wave. Weekends skew a bit lower on average but aren't uniformly quiet.
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
    steps,
    watchSteps: steps,
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

export function healthFixture(now: Date): HealthData {
  const healthRng = mulberry32(20260714);
  return {
    today: { ...healthDayFor(now, 0, healthRng), date: dateDaysAgo(now, 0), exerciseMinutes: 23 },
    history: Array.from({ length: 30 }, (_, i) => healthDayFor(now, 29 - i, healthRng)),
    updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
  };
}

// ── AI usage page (Claude + Codex, no model-specific window) ───────────────────────────────────

/** Rolling-window usage climbs after each reset and falls back at the next one. Rather than
 * hand-smoothing the drop itself, this leaves a real gap in the data spanning each reset — the
 * chart already renders a spacing gap (>3x the median step) as a dashed line instead of a solid
 * one, exactly the "this just reset" signal a real dashboard shows during a sampling gap, and
 * cleaner than an artificial vertical line ever looks. */
interface SawtoothHistoryOptions {
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

function sawtoothHistory({
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

function usageHistoryFor(fiveHour: { usedPercent: number; resetsAt: string }, weekly: { usedPercent: number; resetsAt: string }, seed: number, now: number): AiUsageToolData['history'] {
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

/** Built against an explicit reference time rather than the module's real Date.now(), since the
 * client's chart windows its history against *its own* (possibly faked, see screenshots.ts) clock
 * — generating resetsAt/history off a different "now" than what the browser will use leaves most
 * points outside the chart's visible window, rendering as an oddly short, mostly-empty chart. */
export function buildAiFixtures(now: Date): { claude: AiUsageToolData; codex: AiUsageToolData } {
  const nowMs = now.getTime();
  const isoFrom = (hoursFromNow: number) => new Date(nowMs + hoursFromNow * 3_600_000).toISOString();

  const claudeFiveHour = { usedPercent: 54, resetsAt: isoFrom(2) };
  const claudeWeekly = { usedPercent: 61, resetsAt: isoFrom(90) };
  const claude: AiUsageToolData = {
    available: true,
    fiveHour: claudeFiveHour,
    weekly: claudeWeekly,
    fiveHourStatus: 'limited',
    weeklyStatus: 'limited',
    tokens: { fiveHour: 812_000, weekly: 4_260_000 },
    asOf: isoFrom(0),
    history: usageHistoryFor(claudeFiveHour, claudeWeekly, 1, nowMs),
  };

  const codexFiveHour = { usedPercent: 22, resetsAt: isoFrom(3) };
  const codexWeekly = { usedPercent: 38, resetsAt: isoFrom(90) };
  const codex: AiUsageToolData = {
    available: true,
    fiveHour: codexFiveHour,
    weekly: codexWeekly,
    fiveHourStatus: 'limited',
    weeklyStatus: 'limited',
    tokens: { fiveHour: 305_000, weekly: 1_870_000 },
    asOf: isoFrom(0),
    history: usageHistoryFor(codexFiveHour, codexWeekly, 2, nowMs),
  };

  return { claude, codex };
}

// ── GitHub page ──────────────────────────────────────────────────────────────────────────────

function contributionDays(now: Date, rng: () => number) {
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    // A stable cyclical pattern, not date.getDay() — see healthDayFor's comment on why coupling
    // this to the real weekday reshuffles the whole grid every time "today" rolls to a new day.
    const weekend = i % 7 === 0 || i % 7 === 1;
    const roll = rng();
    let count: number;
    if (weekend) {
      count = roll < 0.3 ? Math.round(rng() * rng() * 6) : 0;
    } else if (roll < 0.1) {
      count = 0; // off day
    } else {
      count = Math.round(1 + rng() * rng() * 13); // skewed toward small counts, occasional bursts
    }
    if (i < 3) count = Math.max(count, 2 + Math.round(rng() * 4)); // matches the activity feed below
    days.push({ date: date.toISOString().slice(0, 10), count });
  }
  return days;
}

export function githubFixture(now: Date): GitHubData {
  const githubRng = mulberry32(42);
  const githubDays = contributionDays(now, githubRng);

  return {
    activity: [
      {
        id: 'ev1', summary: '3 commits', repo: 'yourname/personal-dashboard', timestamp: iso(now, -2), branch: 'dev',
        commits: [
          { sha: 'a1b2c3d', title: 'Add importance scoring to the command center' },
          { sha: 'b2c3d4e', title: 'Wire health baseline into the scoring engine' },
          { sha: 'c3d4e5f', title: 'Fix null coalescing on Postgres-backed health store' },
        ],
      },
      { id: 'ev2', summary: '1 commit', repo: 'yourname/weekend-project', timestamp: iso(now, -26), branch: 'main', commits: [{ sha: 'd4e5f6a', title: 'Prototype the offline sync queue' }] },
    ],
    pullRequests: [
      { title: 'Add importance scoring to the command center', repo: 'yourname/personal-dashboard', number: 42, url: '#', role: 'author', draft: false, updatedAt: iso(now, -2) },
      { title: 'Bump Vite to 7.x', repo: 'yourname/personal-dashboard', number: 40, url: '#', role: 'review-requested', draft: false, updatedAt: iso(now, -20) },
    ],
    issues: [
      { title: 'Contribution grid should scroll on narrow viewports', repo: 'yourname/personal-dashboard', number: 38, url: '#', updatedAt: iso(now, -40) },
    ],
    contributions: { total: githubDays.reduce((sum, day) => sum + day.count, 0), days: githubDays },
    repoHealth: [
      { fullName: 'yourname/personal-dashboard', stars: 12, ciStatus: 'success', ciUrl: '#', latestRelease: 'v1.4.0', url: '#' },
      { fullName: 'yourname/weekend-project', stars: 3, ciStatus: 'running', ciUrl: '#', url: '#' },
      { fullName: 'yourname/dotfiles', stars: 41, ciStatus: 'none', url: '#' },
    ],
  };
}

export interface Fixtures {
  spotifyOverview: SpotifyData;
  spotifyDetail: SpotifyData;
}

export async function loadFixtures(now: Date): Promise<Fixtures> {
  const { overview, detail } = await loadSpotify(now);
  return { spotifyOverview: overview, spotifyDetail: detail };
}
