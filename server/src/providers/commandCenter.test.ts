import { describe, expect, it } from 'vitest';
import type { SpotifyData } from '@personal-dashboard/shared';
import { computeSpotifyFreshness } from './commandCenter.js';
import type { SignalHistoryStore } from '../signalHistory.js';

class InMemorySignals {
  private readonly values = new Map<string, string>();
  private readonly observations = new Map<string, number>();
  private readonly changedAt = new Map<string, Date>();

  async record(source: string, metric: string, value: string) {
    const key = `${source}:${metric}`;
    if (this.values.get(key) === value) return;
    this.values.set(key, value);
    this.observations.set(key, (this.observations.get(key) ?? 0) + 1);
    this.changedAt.set(key, new Date());
  }

  async lastChangedAt(source: string, metric: string) {
    return this.changedAt.get(`${source}:${metric}`);
  }

  async hasChangedSinceBaseline(source: string, metric: string) {
    return (this.observations.get(`${source}:${metric}`) ?? 0) > 1;
  }
}

function spotify(trackId: string): SpotifyData {
  return {
    nowPlaying: null,
    recentlyPlayed: [],
    topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
    topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
    allTime: { artists: [], tracks: [{ id: trackId, track: trackId, artist: 'Artist', playCount: 1 }], albums: [] },
  };
}

describe('computeSpotifyFreshness', () => {
  it('treats the first observed ranking as a baseline, then flags a real change', async () => {
    const signals = new InMemorySignals();

    await expect(computeSpotifyFreshness(signals as unknown as SignalHistoryStore, spotify('the-hills'), 24 * 3_600_000))
      .resolves.toMatchObject({ trackAllTime: false });
    await expect(computeSpotifyFreshness(signals as unknown as SignalHistoryStore, spotify('the-hills'), 24 * 3_600_000))
      .resolves.toMatchObject({ trackAllTime: false });
    await expect(computeSpotifyFreshness(signals as unknown as SignalHistoryStore, spotify('new-track'), 24 * 3_600_000))
      .resolves.toMatchObject({ trackAllTime: true });
  });
});
