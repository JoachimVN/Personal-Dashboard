import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { HealthStore } from './healthStore.js';
import { UsageHistoryStore } from './usageHistory.js';
import { SpotifySnapshotStore } from './spotifyCache.js';
import { SpotifyHistoryStore } from './spotifyHistory/index.js';
import { SignalHistoryStore } from './signalHistory.js';
import { SteamSnapshotStore } from './steamSnapshot.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
// These tests truncate their database between cases. Refuse to run if a shell has pointed the
// test URL at the dashboard's live DATABASE_URL (for example via a broad `source .env`).
const isIsolatedDatabase = Boolean(databaseUrl) && databaseUrl !== process.env.DATABASE_URL;
const describeDatabase = isIsolatedDatabase ? describe : describe.skip;
let database: Database;

async function clearDatabase() {
  await database.client`
    truncate ai_usage_history_points, ai_usage_snapshots, health_days, signal_history, signal_current,
      spotify_observed_plays, spotify_tracks, spotify_artists, spotify_albums, spotify_history_meta,
      spotify_snapshot restart identity
  `;
}

describeDatabase('Postgres stores', () => {
  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    await migrateDatabase(database);
  });
  afterEach(clearDatabase);
  afterAll(async () => database.client.end({ timeout: 5 }));

  it('merges health device readings without double-counting', async () => {
    const store = new HealthStore(database);
    await store.ingest({ phoneSteps: 6_500 }, '2026-07-13');
    await store.ingest({ watchSteps: 8_200 }, '2026-07-13');
    expect((await store.snapshot('2026-07-13')).today).toMatchObject({
      steps: 8_200, watchSteps: 8_200, phoneSteps: 6_500,
    });
  });

  it('falls back to today when a sample posts a blank date instead of omitting it', async () => {
    const store = new HealthStore(database);
    await store.ingest({ date: '', watchSteps: 1_442 }, '2026-07-13');
    const snapshot = await store.snapshot('2026-07-13');
    expect(snapshot.today).toMatchObject({ date: '2026-07-13', steps: 1_442 });
    expect(snapshot.history).toHaveLength(1);
  });

  it('deduplicates usage samples and retains the last good snapshot', async () => {
    const store = new UsageHistoryStore(database, 15 * 60_000);
    const asOf = new Date(Date.now() - 60_000).toISOString();
    const snapshot = { available: true, asOf, fiveHour: { usedPercent: 12, resetsAt: '2026-07-13T14:00:00.000Z' } };
    expect(await store.record('codex', snapshot)).toHaveLength(1);
    expect(await store.record('codex', snapshot)).toHaveLength(1);
    expect(await store.getSnapshot('codex')).toEqual(snapshot);
  });

  it('reads only the window the charts render, so the series cannot grow without bound', async () => {
    // The whole series ships inside the widget payload on every poll, over a billed TCP proxy.
    // Unbounded, that is the signal_history runaway again in a different table: measured
    // 2026-08-27 at 7,970 sequential scans over 23.4M tuples in four days.
    const store = new UsageHistoryStore(database, 15 * 60_000);
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60_000).toISOString();
    for (const age of [90, 60, 46, 44, 10, 1]) {
      await database.client`
        insert into ai_usage_history_points (tool_id, at, five_hour_used_percent)
        values ('codex', ${daysAgo(age)}, ${age})
      `;
    }

    const points = await store.get('codex');

    expect(points.map((p) => p.fiveHourUsedPercent)).toEqual([44, 10, 1]);
    // The rows are still there — this bounds the read, not the data.
    const [{ count }] = await database.client<{ count: number }[]>`
      select count(*)::int as count from ai_usage_history_points where tool_id = 'codex'
    `;
    expect(count).toBe(6);
  });

  it('shares Spotify snapshot state and history between store instances', async () => {
    const cache = new SpotifySnapshotStore(database);
    const snapshot = { nowPlaying: null, recentlyPlayed: [], topArtists: { shortTerm: [], mediumTerm: [] }, topTracks: { shortTerm: [], mediumTerm: [] }, allTime: { artists: [], tracks: [], albums: [] } };
    await cache.setSnapshot(snapshot);
    await cache.setRateLimitedUntil(123);
    expect(await new SpotifySnapshotStore(database).getRateLimitedUntil()).toBe(123);
    const history = new SpotifyHistoryStore(database);
    const track = { id: 'track-1', name: 'Song', artists: [{ id: 'artist-1', name: 'Artist' }], album: { id: 'album-1', name: 'Album' } };
    await history.recordPlays([{ playedAt: '2026-07-13T12:00:00.000Z', track }]);
    await history.recordPlays([{ playedAt: '2026-07-13T12:00:00.000Z', track }]);
    expect((await new SpotifyHistoryStore(database).getAllTime(10, 0)).tracks[0]).toMatchObject({ id: 'track-1', playCount: 1 });
  }, 20_000);

  it('picks the same canonical album/track deterministically when editions tie on name and play count', async () => {
    const trackFor = (id: string, albumId: string, albumName: string) => ({
      id, name: 'Duplicate Song', artists: [{ id: 'artist-dup', name: 'Duplicate Artist' }],
      album: { id: albumId, name: albumName },
    });
    // Spotify can catalog the exact same release under two ids with no edition suffix to break the
    // tie — insertion order used to decide which id "won" as canonical (see store.ts), which made
    // the pick flip between refreshes. Recording the b-then-a order here should still land on the
    // lexicographically-smaller id, matching the a-then-b order below.
    const history = new SpotifyHistoryStore(database);
    await history.recordPlays([
      { playedAt: '2026-07-13T12:00:00.000Z', track: trackFor('track-z', 'album-z', 'Duplicate Album') },
      { playedAt: '2026-07-13T12:01:00.000Z', track: trackFor('track-a', 'album-a', 'Duplicate Album') },
    ]);
    const result = await new SpotifyHistoryStore(database).getAllTime(10, 0);
    expect(result.albums[0]).toMatchObject({ id: 'album-a', playCount: 2 });
    expect(result.tracks[0]).toMatchObject({ id: 'track-a', playCount: 2 });
  });

  it('stores discovered top-list tracks without treating affinity as a play', async () => {
    const history = new SpotifyHistoryStore(database);
    const discovered = { id: 'track-top', name: 'Top song', artists: [{ id: 'artist-top', name: 'Top artist' }], album: { id: 'album-top', name: 'Top album' } };
    await history.discoverTracks([discovered]);
    expect(await database.client`select id, play_count from spotify_tracks`).toEqual([
      { id: 'track-top', play_count: 0 },
    ]);
    expect((await history.getAllTime(10, 0)).tracks).toEqual([]);
  });

  it('records signal history only when a value genuinely changes', async () => {
    const signals = new SignalHistoryStore(database);
    await signals.record('gmail', 'unreadThreads', 2);
    const first = await signals.lastChangedAt('gmail', 'unreadThreads');
    await signals.record('gmail', 'unreadThreads', 2);
    expect(await database.client`select * from signal_history`).toHaveLength(1);
    expect(await signals.lastChangedAt('gmail', 'unreadThreads')).toEqual(first);
  });

  // Regression: the unchanged-check used to stringify the value read back from the jsonb column and
  // compare it to a fresh JSON.stringify of the payload. jsonb reorders object keys (shortest
  // first), so any payload of more than one key re-serialized differently every time and every poll
  // archived a full copy — `signal_history` reached 1 GB, 72% of it byte-identical duplicates. The
  // case above survived only because a bare `2` round-trips unchanged.
  it('treats a payload as unchanged when only its key order differs', async () => {
    const signals = new SignalHistoryStore(database);
    // Deliberately not jsonb's canonical order, so a round trip is guaranteed to reorder it.
    const payload = { fiveHourStatus: 'ok', weeklyStatus: 'ok', available: true, asOf: '2026-08-23T12:00:00.000Z' };
    await signals.record('ai-usage-codex', 'payload', payload);
    await signals.record('ai-usage-codex', 'payload', { ...payload });
    expect(await database.client`select * from signal_history where source = 'ai-usage-codex'`).toHaveLength(1);

    // A real change still lands, and nested objects/arrays are compared by value too.
    await signals.record('ai-usage-codex', 'payload', { ...payload, available: false });
    expect(await database.client`select * from signal_history where source = 'ai-usage-codex'`).toHaveLength(2);

    const nested = { rooms: [{ id: '83', name: 'Bathroom', anyOn: false }], reachable: true };
    await signals.record('hue', 'payload', nested);
    await signals.record('hue', 'payload', { reachable: true, rooms: [{ anyOn: false, name: 'Bathroom', id: '83' }] });
    expect(await database.client`select * from signal_history where source = 'hue'`).toHaveLength(1);
  });

  // Regression: postgres.js decodes temporal columns into Date objects by default. Every store here
  // expects raw strings, because constructing a drizzle instance used to configure that on the
  // shared client as a side effect. Dropping drizzle (nothing queries through it, and it costs
  // ~160 MB resident) silently changed decoding codebase-wide — `health_days.updated_at` began
  // arriving as a Date where `healthSchema` wants z.string(), and the whole health widget failed.
  // createDatabase now sets those parsers explicitly; this pins the contract.
  it('decodes temporal columns as strings, not Date objects', async () => {
    await new HealthStore(database).ingest({ steps: 100 }, '2026-07-20');
    const [row] = await database.client<{ updated_at: unknown; date: unknown }[]>`
      select updated_at, date from health_days limit 1
    `;
    expect(typeof row.updated_at).toBe('string');
    expect(typeof row.date).toBe('string');
    expect(row.updated_at).not.toBeInstanceOf(Date);

    // And the health provider's own snapshot still satisfies the wire schema.
    const snapshot = await new HealthStore(database).snapshot('2026-07-20');
    expect(typeof snapshot.updatedAt).toBe('string');
  });

  it('skips the database entirely when re-recording a value this process already wrote', async () => {
    const signals = new SignalHistoryStore(database);
    await signals.record('weather', 'payload', { tempC: 14, summary: 'cloudy' });
    expect(await database.client`select * from signal_history where source = 'weather'`).toHaveLength(1);

    // Clearing signal_current removes the only thing the DB-side check consults. If record() still
    // reached Postgres it would find nothing, conclude "changed", and write a second row.
    await database.client`delete from signal_current where source = 'weather'`;
    await signals.record('weather', 'payload', { tempC: 14, summary: 'cloudy' });
    expect(await database.client`select * from signal_history where source = 'weather'`).toHaveLength(1);
    expect(await database.client`select * from signal_current where source = 'weather'`).toHaveLength(0);

    // A genuine change still goes through, and a fresh store has no cache to short-circuit with.
    await signals.record('weather', 'payload', { tempC: 15, summary: 'cloudy' });
    expect(await database.client`select * from signal_history where source = 'weather'`).toHaveLength(2);
    await new SignalHistoryStore(database).record('weather', 'payload', { tempC: 15, summary: 'cloudy' });
    expect(await database.client`select * from signal_current where source = 'weather'`).toHaveLength(1);
  });

  it('prunes aged observations but never the newest one of a signal', async () => {
    const signals = new SignalHistoryStore(database);
    await signals.record('gmail', 'unreadThreads', 1);
    await signals.record('gmail', 'unreadThreads', 2);
    await signals.record('gmail', 'unreadThreads', 3);
    // A signal whose only observation is ancient: it must survive, or `hasChangedSinceBaseline`
    // would start claiming a long-settled signal had never been seen.
    await signals.record('steam', 'payload', { game: null });
    // Distinct ages: (source, metric, recorded_at) is unique, so backdating both gmail rows to the
    // same instant would collide rather than age them.
    await database.client`update signal_history set recorded_at = now() - interval '400 days' where value::text = '1'`;
    await database.client`update signal_history set recorded_at = now() - interval '300 days' where value::text = '2'`;
    await database.client`update signal_history set recorded_at = now() - interval '400 days' where source = 'steam'`;

    expect(await signals.prune(180)).toBe(2);
    const remaining = await database.client<{ source: string; value: unknown }[]>`
      select source, value from signal_history order by source, recorded_at
    `;
    expect(remaining.map((r) => r.source)).toEqual(['gmail', 'steam']);
    expect(remaining[0].value).toBe(3);
    expect(await signals.hasChangedSinceBaseline('gmail', 'unreadThreads')).toBe(false);

    // Retention off keeps everything.
    expect(await signals.prune(0)).toBe(0);
  });

  it('round-trips Steam snapshot, library, and per-game achievement caches', async () => {
    const store = new SteamSnapshotStore(database);
    const snapshot = {
      profile: { steamId: '76561198000000000', personaName: 'Alex', profileUrl: 'https://steamcommunity.com/id/alex' },
      currentGame: null,
      library: null,
      recentlyPlayed: [],
      achievements: null,
      friendsInGame: [],
      playtimeHistory: [],
      friendsLeaderboard: { status: 'unavailable', entries: [] },
      availability: { library: 'unavailable', achievements: 'unavailable', friends: 'unavailable' },
    };
    await store.setSnapshot(snapshot as never);
    expect((await store.getSnapshot())?.data).toEqual(snapshot);

    const library = { totalGames: 3, totalPlaytimeMinutes: 900, recentPlaytimeMinutes: 60, mostPlayed: [], allGames: [] };
    await store.setLibraryCache(library);
    expect((await store.getLibraryCache())?.data).toEqual(library);

    const schema = [{ apiName: 'ACH_1', displayName: 'Freeman' }];
    await store.setAchievementSchema(10, schema);
    expect((await store.getAchievementSchema(10))?.data).toEqual(schema);
    expect(await store.getAchievementSchema(20)).toBeUndefined();

    const percentages = [{ apiName: 'ACH_1', percent: 4.2 }];
    await store.setAchievementPercentages(10, percentages);
    expect((await store.getAchievementPercentages(10))?.data).toEqual(percentages);
  });
});
