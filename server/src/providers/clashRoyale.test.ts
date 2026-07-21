import { describe, expect, it, vi } from 'vitest';
import { battleResult, createClashRoyaleProvider, mapBattle, mapCard, normalizeTag, toIsoTimestamp } from './clashRoyale.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('normalizeTag', () => {
  it('upper-cases and adds the leading # when missing', () => {
    expect(normalizeTag('abc123')).toBe('#ABC123');
  });

  it('leaves an already-normalized tag untouched', () => {
    expect(normalizeTag('#ABC123')).toBe('#ABC123');
  });

  it('trims whitespace', () => {
    expect(normalizeTag('  #abc123  ')).toBe('#ABC123');
  });
});

describe('toIsoTimestamp', () => {
  it('inserts ISO 8601 separators into Supercell\'s compact timestamp', () => {
    expect(toIsoTimestamp('20260721T120000.000Z')).toBe('2026-07-21T12:00:00.000Z');
    expect(new Date(toIsoTimestamp('20260721T120000.000Z')).toString()).not.toBe('Invalid Date');
  });

  it('handles a timestamp with no fractional seconds', () => {
    expect(toIsoTimestamp('20260721T120000Z')).toBe('2026-07-21T12:00:00Z');
  });

  it('returns the input unchanged if it does not match the expected shape', () => {
    expect(toIsoTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
  });
});

describe('mapCard', () => {
  it('maps a raw card, carrying through the medium icon URL', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14, iconUrls: { medium: 'https://x/knight.png' } })).toEqual({
      id: 1,
      name: 'Knight',
      level: 10,
      maxLevel: 14,
      iconUrl: 'https://x/knight.png',
    });
  });

  it('leaves iconUrl undefined when no iconUrls are reported', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14 }).iconUrl).toBeUndefined();
  });
});

describe('battleResult', () => {
  it('is a win when the player crowned more than the opponent', () => {
    expect(battleResult([{ crowns: 2 }], [{ crowns: 1 }])).toBe('win');
  });

  it('is a loss when the opponent crowned more', () => {
    expect(battleResult([{ crowns: 0 }], [{ crowns: 1 }])).toBe('loss');
  });

  it('is a draw on equal crowns', () => {
    expect(battleResult([{ crowns: 1 }], [{ crowns: 1 }])).toBe('draw');
  });
});

describe('mapBattle', () => {
  it('derives result, crown totals, opponent name and trophy change', () => {
    expect(
      mapBattle({
        battleTime: '20260721T120000.000Z',
        type: 'PvP',
        team: [{ crowns: 2, name: 'Me', trophyChange: 28 }],
        opponent: [{ crowns: 1, name: 'Rival' }],
      }),
    ).toEqual({
      battleTime: '2026-07-21T12:00:00.000Z',
      type: 'PvP',
      result: 'win',
      crownsFor: 2,
      crownsAgainst: 1,
      opponentName: 'Rival',
      trophyChange: 28,
    });
  });
});

describe('createClashRoyaleProvider', () => {
  it('is unconfigured without auth', () => {
    expect(createClashRoyaleProvider(undefined).isConfigured()).toBe(false);
  });

  it('fetches player, battle log and upcoming chests, encoding the tag once each', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          tag: '#ABC123',
          name: 'Player',
          expLevel: 12,
          trophies: 5000,
          bestTrophies: 5200,
          wins: 100,
          losses: 50,
          threeCrownWins: 20,
          battleCount: 150,
          arena: { name: 'Legendary Arena' },
          currentDeck: [{ id: 1, name: 'Knight', level: 10, maxLevel: 14 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { battleTime: '20260721T120000.000Z', type: 'PvP', team: [{ crowns: 1 }], opponent: [{ crowns: 0 }] },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ name: 'Silver Chest' }, { name: 'Gold Chest' }] }));

    const provider = createClashRoyaleProvider({ apiKey: 'key', playerTag: 'abc123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('%23ABC123');
    }
    expect(data.profile.name).toBe('Player');
    expect(data.upcomingChests).toEqual(['Silver Chest', 'Gold Chest']);
    expect(data.recentBattles).toHaveLength(1);
    fetchMock.mockRestore();
  });
});
