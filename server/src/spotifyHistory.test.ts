import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SpotifyHistoryStore, type PlayedTrackInput } from './spotifyHistory.js';

const directories: string[] = [];

function createStore(): { store: SpotifyHistoryStore; filePath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'spotify-history-'));
  directories.push(directory);
  const filePath = path.join(directory, 'spotify-history.json');
  return { store: new SpotifyHistoryStore(filePath), filePath };
}

function track(overrides: Partial<PlayedTrackInput> = {}): PlayedTrackInput {
  return {
    id: 't1',
    name: 'Track One',
    url: 'https://open.spotify.com/track/t1',
    artists: [{ id: 'a1', name: 'Artist One' }],
    album: { id: 'al1', name: 'Album One', imageUrl: 'https://img/al1.jpg', releaseDate: '2020' },
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SpotifyHistoryStore', () => {
  it('is unseeded until seedIfNeeded is called, and seeds only once', () => {
    const { store } = createStore();
    expect(store.isSeeded()).toBe(false);

    store.seedIfNeeded({
      artists: [{ id: 'a1', name: 'Artist One', genres: ['pop'] }],
      tracks: [track()],
    });
    expect(store.isSeeded()).toBe(true);
    const first = store.getAllTime();

    store.seedIfNeeded({
      artists: [{ id: 'a2', name: 'Artist Two', genres: [] }],
      tracks: [track({ id: 't2', name: 'Track Two' })],
    });
    expect(store.getAllTime()).toEqual(first);
  });

  it('records plays, incrementing track/artist/album counts and deduping by played_at', () => {
    const { store } = createStore();
    store.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]);
    store.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]); // duplicate, older/equal cutoff
    store.recordPlays([{ playedAt: '2026-01-02T00:00:00Z', track: track() }]);

    const allTime = store.getAllTime();
    expect(allTime.tracks).toEqual([expect.objectContaining({ id: 't1', playCount: 2 })]);
    expect(allTime.artists).toEqual([expect.objectContaining({ id: 'a1', playCount: 2 })]);
    expect(allTime.albums).toEqual([expect.objectContaining({ id: 'al1', playCount: 2 })]);
  });

  it('sorts all-time leaderboards by play count descending', () => {
    const { store } = createStore();
    store.recordPlays([
      { playedAt: '2026-01-01T00:00:00Z', track: track({ id: 't1', artists: [{ id: 'a1', name: 'Artist One' }] }) },
      { playedAt: '2026-01-02T00:00:00Z', track: track({ id: 't2', name: 'Track Two', artists: [{ id: 'a2', name: 'Artist Two' }], album: { id: 'al2', name: 'Album Two' } }) },
      { playedAt: '2026-01-03T00:00:00Z', track: track({ id: 't2', name: 'Track Two', artists: [{ id: 'a2', name: 'Artist Two' }], album: { id: 'al2', name: 'Album Two' } }) },
    ]);

    const allTime = store.getAllTime();
    expect(allTime.tracks.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(allTime.artists.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(allTime.albums.map((a) => a.id)).toEqual(['al2', 'al1']);
  });

  it('backfills missing artist image/url/genres via mergeArtistMetadata without overwriting existing values', () => {
    const { store } = createStore();
    store.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]);
    store.mergeArtistMetadata([
      { id: 'a1', name: 'Artist One', imageUrl: 'https://img/a1.jpg', url: 'https://open.spotify.com/artist/a1', genres: ['pop', 'rock'] },
    ]);
    store.mergeArtistMetadata([
      { id: 'a1', name: 'Artist One', imageUrl: 'https://img/other.jpg', url: 'https://other', genres: ['jazz'] },
    ]);

    const [artist] = store.getAllTime().artists;
    expect(artist).toMatchObject({
      imageUrl: 'https://img/a1.jpg',
      url: 'https://open.spotify.com/artist/a1',
      genres: ['pop', 'rock'],
    });
  });

  it('persists seed state, counts, and lastPlayedAt cursor across restarts', () => {
    const { store, filePath } = createStore();
    store.seedIfNeeded({ artists: [{ id: 'a1', name: 'Artist One', genres: [] }], tracks: [] });
    store.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]);

    const reloaded = new SpotifyHistoryStore(filePath);
    expect(reloaded.isSeeded()).toBe(true);
    expect(reloaded.getAllTime().tracks).toEqual(store.getAllTime().tracks);

    // A duplicate of the already-recorded play should still be a no-op after reload.
    reloaded.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]);
    expect(reloaded.getAllTime().tracks[0].playCount).toBe(1);
  });

  it('computes each album\'s top 3 tracks by play count, scoped to that album', () => {
    const { store } = createStore();
    store.recordPlays([
      { playedAt: '2026-01-01T00:00:00Z', track: track({ id: 't1', name: 'Track One' }) },
      { playedAt: '2026-01-02T00:00:00Z', track: track({ id: 't2', name: 'Track Two' }) },
      { playedAt: '2026-01-03T00:00:00Z', track: track({ id: 't2', name: 'Track Two' }) },
      { playedAt: '2026-01-04T00:00:00Z', track: track({ id: 't3', name: 'Track Three' }) },
      { playedAt: '2026-01-05T00:00:00Z', track: track({ id: 't4', name: 'Track Four' }) },
      // A track from a different album must not show up in album al1's top tracks.
      {
        playedAt: '2026-01-06T00:00:00Z',
        track: track({ id: 't5', name: 'Other Album Track', album: { id: 'al2', name: 'Album Two' } }),
      },
    ]);

    const [album] = store.getAllTime().albums.filter((a) => a.id === 'al1');
    expect(album.topTracks).toEqual([
      expect.objectContaining({ id: 't2', playCount: 2 }),
      expect.objectContaining({ id: 't1', playCount: 1 }),
      expect.objectContaining({ id: 't3', playCount: 1 }),
    ]);
  });

  it('backfills album duration via enrichAlbumDurations, once per album', () => {
    const { store } = createStore();
    store.recordPlays([{ playedAt: '2026-01-01T00:00:00Z', track: track() }]);
    expect(store.getAlbumIdsNeedingDurations(20)).toEqual(['al1']);

    store.enrichAlbumDurations([{ id: 'al1', totalDurationMs: 2_400_000 }]);
    expect(store.getAlbumIdsNeedingDurations(20)).toEqual([]);
    const [album] = store.getAllTime().albums;
    expect(album.totalDurationMs).toBe(2_400_000);
  });
});
