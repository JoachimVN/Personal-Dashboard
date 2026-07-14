import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SpotifySnapshotStore } from './spotifyCache.js';

const directories: string[] = [];

function snapshot() {
  return {
    nowPlaying: null,
    recentlyPlayed: [],
    topArtists: { shortTerm: [], mediumTerm: [] },
    topTracks: { shortTerm: [], mediumTerm: [] },
    allTime: { artists: [], tracks: [], albums: [] },
  };
}

function createStore(): { store: SpotifySnapshotStore; filePath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'spotify-cache-'));
  directories.push(directory);
  const filePath = path.join(directory, 'spotify-cache.json');
  return { store: new SpotifySnapshotStore(filePath), filePath };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SpotifySnapshotStore', () => {
  it('persists the last-good snapshot and cooldown across restarts', () => {
    const { store, filePath } = createStore();
    const data = snapshot();
    const rateLimitedUntil = Date.now() + 30_000;

    store.setRateLimitedUntil(rateLimitedUntil);
    store.setSnapshot(data);
    store.setRateLimitedUntil(rateLimitedUntil);

    const reloaded = new SpotifySnapshotStore(filePath);
    expect(reloaded.getSnapshot()).toEqual(data);
    expect(reloaded.getRateLimitedUntil()).toBe(rateLimitedUntil);
  });
});
