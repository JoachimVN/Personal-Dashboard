import { describe, expect, it, vi } from 'vitest';
import { createValorantProvider } from './valorant.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const rawMatch = {
  metadata: {
    match_id: 'match-1',
    map: { name: 'Ascent' },
    queue: { name: 'Competitive' },
    started_at: '2026-07-21T18:00:00.000Z',
  },
  teams: [{ team_id: 'red', won: true, rounds: { won: 13, lost: 8 } }],
  players: [{
    puuid: 'player-1',
    team_id: 'red',
    agent: { id: 'agent-1', name: 'Omen' },
    stats: {
      score: 4200,
      kills: 20,
      deaths: 15,
      assists: 8,
      headshots: 10,
      bodyshots: 40,
      legshots: 5,
      damage: { dealt: 3000, received: 2100 },
    },
  }],
};

describe('Valorant provider history', () => {
  it('backfills stored matches and attaches their ranked act without delaying the normal snapshot', async () => {
    const historyStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockImplementation(async (value) => ({ ...value, fetchedAt: '2026-07-22T00:00:00.000Z' })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/account/')) return jsonResponse({ data: { puuid: 'player-1', region: 'eu', account_level: 100, name: 'Synthetic', tag: 'VAL' } });
      if (url.includes('/valorant/v3/mmr/')) return jsonResponse({ data: {
        current: { tier: { id: 18, name: 'Diamond 1' }, rr: 42, last_change: 18, leaderboard_placement: null },
        peak: { tier: { id: 21, name: 'Ascendant 1' } },
        seasonal: [{ season: { short: 'e10a2' }, wins: 12, games: 20 }],
      } });
      if (url.includes('/valorant/v4/matches/')) return jsonResponse({ data: [rawMatch] });
      if (url.includes('/stored-matches/')) return jsonResponse({ results: { total: 1 }, data: [rawMatch] });
      if (url.includes('/stored-mmr-history/')) return jsonResponse({ results: { total: 1 }, data: [{ match_id: 'match-1', season: { short: 'e10a2' } }] });
      throw new Error(`Unexpected request: ${url}`);
    });

    const provider = createValorantProvider({ apiKey: 'key', name: 'Synthetic', tag: 'VAL', region: 'eu' }, historyStore as never);
    const data = await provider.fetch(new AbortController().signal, false);

    expect(historyStore.set).toHaveBeenCalledWith(expect.objectContaining({ totalMatchesAvailable: 1 }));
    expect(data.history.currentActShort).toBe('e10a2');
    expect(data.history.matches).toHaveLength(1);
    expect(data.history.matches[0]).toMatchObject({ agentName: 'Omen', actShort: 'e10a2' });
    fetchMock.mockRestore();
  });

  it('uses a fresh local archive without requesting stored history again', async () => {
    const historyStore = {
      get: vi.fn().mockResolvedValue({
        matches: [],
        totalMatchesAvailable: 42,
        fetchedAt: new Date().toISOString(),
        sourceVersion: 2,
      }),
      set: vi.fn(),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/account/')) return jsonResponse({ data: { puuid: 'player-1', region: 'eu', account_level: 100, name: 'Synthetic', tag: 'VAL' } });
      if (url.includes('/valorant/v3/mmr/')) return jsonResponse({ data: {
        current: { tier: { id: 18, name: 'Diamond 1' }, rr: 42, last_change: 18, leaderboard_placement: null },
        peak: { tier: { id: 21, name: 'Ascendant 1' } },
        seasonal: [],
      } });
      if (url.includes('/valorant/v4/matches/')) return jsonResponse({ data: [rawMatch] });
      throw new Error(`Stored history should not be requested: ${url}`);
    });

    const provider = createValorantProvider({ apiKey: 'key', name: 'Synthetic', tag: 'VAL', region: 'eu' }, historyStore as never);
    const data = await provider.fetch(new AbortController().signal, false);

    expect(historyStore.set).not.toHaveBeenCalled();
    expect(data.history.totalMatchesAvailable).toBe(42);
    expect(data.history.matches).toHaveLength(1);
    fetchMock.mockRestore();
  });

  it('continues an unfinished archive even when its last sync is fresh', async () => {
    const historyStore = {
      get: vi.fn().mockResolvedValue({
        matches: [],
        totalMatchesAvailable: 10,
        fetchedAt: new Date().toISOString(),
        nextPage: 2,
        sourceVersion: 2,
      }),
      set: vi.fn().mockImplementation(async (value) => ({ ...value, fetchedAt: new Date().toISOString() })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/account/')) return jsonResponse({ data: { puuid: 'player-1', region: 'eu', account_level: 100, name: 'Synthetic', tag: 'VAL' } });
      if (url.includes('/valorant/v3/mmr/')) return jsonResponse({ data: {
        current: { tier: { id: 18, name: 'Diamond 1' }, rr: 42, last_change: 18, leaderboard_placement: null },
        peak: { tier: { id: 21, name: 'Ascendant 1' } },
        seasonal: [],
      } });
      if (url.includes('/valorant/v4/matches/')) return jsonResponse({ data: [rawMatch] });
      if (url.includes('/stored-mmr-history/')) return jsonResponse({ results: { total: 1 }, data: [{ match_id: 'match-1', season: { short: 'e10a2' } }] });
      throw new Error(`Unexpected request: ${url}`);
    });

    const provider = createValorantProvider({ apiKey: 'key', name: 'Synthetic', tag: 'VAL', region: 'eu' }, historyStore as never);
    await provider.fetch(new AbortController().signal, false);

    expect(historyStore.set).toHaveBeenCalledWith(expect.objectContaining({ nextPage: 1 }));
    fetchMock.mockRestore();
  });
});
