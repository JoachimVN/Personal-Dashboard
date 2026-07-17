import { describe, expect, it } from 'vitest';
import type { SpotifyData, SteamData } from '@personal-dashboard/shared';
import { computeSpotifyFreshness, computeSteamMoments } from './commandCenter.js';
import type { SignalHistoryStore } from '../signalHistory.js';

class InMemorySignals {
  private readonly values = new Map<string, unknown>();
  private readonly observations = new Map<string, number>();
  private readonly changedAt = new Map<string, Date>();

  async record(source: string, metric: string, value: unknown) {
    const key = `${source}:${metric}`;
    if (this.values.has(key) && JSON.stringify(this.values.get(key)) === JSON.stringify(value)) return;
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

  async getValue(source: string, metric: string) {
    return this.values.get(`${source}:${metric}`);
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

function steam(overrides: Partial<SteamData>): SteamData {
  return {
    profile: { steamId: '76561198000000000', personaName: 'Alex', profileUrl: 'https://steamcommunity.com/id/alex' },
    currentGame: null,
    library: null,
    recentlyPlayed: [],
    achievements: null,
    friendsInGame: [],
    playtimeHistory: [],
    friendsLeaderboard: { status: 'unavailable', entries: [] },
    availability: { library: 'unavailable', achievements: 'unavailable', friends: 'unavailable' },
    ...overrides,
  };
}

const FRESH_MS = 3 * 24 * 3_600_000;

describe('computeSteamMoments', () => {
  it('does not fire a completion on the first poll, only once it changes from incomplete', async () => {
    const signals = new InMemorySignals() as unknown as SignalHistoryStore;
    const completedGame = { appId: 10, gameName: 'Portal', unlockedCount: 5, totalCount: 5, recentUnlocks: [], rarest: [], nextEasiest: [] };

    await expect(computeSteamMoments(signals, steam({ achievements: completedGame }), [], FRESH_MS))
      .resolves.toMatchObject({ completedGame: false });

    const incomplete = { ...completedGame, unlockedCount: 4 };
    await computeSteamMoments(signals, steam({ achievements: incomplete }), [], FRESH_MS);
    await expect(computeSteamMoments(signals, steam({ achievements: completedGame }), [], FRESH_MS))
      .resolves.toMatchObject({ completedGame: true });
  });

  it('reports the highest milestone crossed for the tracked game, ignoring a first-poll baseline', async () => {
    const signals = new InMemorySignals() as unknown as SignalHistoryStore;
    const game = (minutes: number) => ({ appId: 10, name: 'Half-Life', playtimeForeverMinutes: minutes });

    await expect(computeSteamMoments(signals, steam({ currentGame: game(600) }), [10, 25, 50], FRESH_MS))
      .resolves.toEqual({ completedGame: false });
    await expect(computeSteamMoments(signals, steam({ currentGame: game(1_700) }), [10, 25, 50], FRESH_MS))
      .resolves.toMatchObject({ playtimeMilestoneHours: 25 });
  });

  it('surfaces the first milestone when the baseline was below every threshold', async () => {
    const signals = new InMemorySignals() as unknown as SignalHistoryStore;
    const game = (minutes: number) => ({ appId: 10, name: 'Half-Life', playtimeForeverMinutes: minutes });

    await computeSteamMoments(signals, steam({ currentGame: game(540) }), [10, 25, 50], FRESH_MS);
    await expect(computeSteamMoments(signals, steam({ currentGame: game(610) }), [10, 25, 50], FRESH_MS))
      .resolves.toMatchObject({ playtimeMilestoneHours: 10 });
  });

  it('reports a leaderboard climb only when the rank improves after a baseline observation', async () => {
    const signals = new InMemorySignals() as unknown as SignalHistoryStore;
    const board = (rank: number) => steam({
      friendsLeaderboard: {
        status: 'available',
        entries: [
          ...Array.from({ length: rank }, (_, index) => ({ steamId: `f${index}`, personaName: `Friend ${index}`, sharedGames: 1, isYou: false })),
          { steamId: 'you', personaName: 'Alex', sharedGames: 1, isYou: true },
        ],
      },
    });

    await expect(computeSteamMoments(signals, board(3), [], FRESH_MS)).resolves.toEqual({ completedGame: false });
    await expect(computeSteamMoments(signals, board(1), [], FRESH_MS)).resolves.toMatchObject({ leaderboardClimb: { rank: 1, delta: 2 } });
    await expect(computeSteamMoments(signals, board(2), [], FRESH_MS)).resolves.toEqual({ completedGame: false });
  });
});
