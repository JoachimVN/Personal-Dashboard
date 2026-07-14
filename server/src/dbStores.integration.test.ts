import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { HealthStore } from './healthStore.js';
import { UsageHistoryStore } from './usageHistory.js';
import { SpotifySnapshotStore } from './spotifyCache.js';
import { SpotifyHistoryStore } from './spotifyHistory.js';
import { SignalHistoryStore } from './signalHistory.js';

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
    const store = new HealthStore(database, 30);
    await store.ingest({ phoneSteps: 6_500 }, '2026-07-13');
    await store.ingest({ watchSteps: 8_200 }, '2026-07-13');
    expect((await store.snapshot('2026-07-13')).today).toMatchObject({
      steps: 8_200, watchSteps: 8_200, phoneSteps: 6_500,
    });
  });

  it('deduplicates usage samples and retains the last good snapshot', async () => {
    const store = new UsageHistoryStore(database, 15 * 60_000, 7 * 24 * 60 * 60_000);
    const snapshot = { available: true, asOf: '2026-07-13T12:00:00.000Z', fiveHour: { usedPercent: 12, resetsAt: '2026-07-13T14:00:00.000Z' } };
    expect(await store.record('codex', snapshot)).toHaveLength(1);
    expect(await store.record('codex', snapshot)).toHaveLength(1);
    expect(await store.getSnapshot('codex')).toEqual(snapshot);
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
});
