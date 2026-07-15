import { describe, expect, it, vi } from 'vitest';
import type { SpotifyData } from '@personal-dashboard/shared';
import { createSpotifyProvider } from './spotify.js';

vi.mock('../spotifyToken.js', () => ({
  readSpotifyToken: () => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 120_000,
  }),
  writeSpotifyToken: vi.fn(),
}));

const snapshot: SpotifyData = {
  nowPlaying: {
    track: 'Old Song',
    artist: 'Old Artist',
    isPlaying: true,
    progressMs: 42_000,
    durationMs: 180_000,
  },
  recentlyPlayed: [],
  topArtists: { shortTerm: [], mediumTerm: [] },
  topTracks: { shortTerm: [], mediumTerm: [] },
  allTime: { artists: [], tracks: [], albums: [] },
};

describe('Spotify provider', () => {
  it('hides stale now-playing data while preserving the cached snapshot after a rate limit', async () => {
    const snapshotStore = {
      getRateLimitedUntil: vi.fn().mockResolvedValue(0),
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      setRateLimitedUntil: vi.fn().mockResolvedValue(undefined),
    };
    const historyStore = {};
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 429,
      headers: { 'retry-after': '30' },
    }));

    try {
      const provider = createSpotifyProvider(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        snapshotStore as never,
        historyStore as never,
      );

      await expect(provider.fetch(new AbortController().signal)).resolves.toEqual({
        ...snapshot,
        nowPlaying: null,
      });
      expect(snapshotStore.setRateLimitedUntil).toHaveBeenCalledOnce();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
