import { describe, expect, it, vi } from 'vitest';
import { battleResult, clashRoyaleWikiCardImageUrl, createClashRoyaleProvider, findDeckHero, isEvolutionDeckSlot, mapBattle, mapCard, normalizeTag, toIsoTimestamp } from './clashRoyale.js';

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
  it('uses wiki card artwork and preserves the API artwork as a fallback', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14, evolutionLevel: 1, iconUrls: { medium: 'https://x/knight.png' } }, new Map(), true)).toEqual({
      id: 1,
      name: 'Knight',
      level: 10,
      maxLevel: 14,
      evolutionLevel: 1,
      iconUrl: 'https://static.wikia.nocookie.net/clashroyale/images/c/c1/KnightCardEvolution.png',
      fallbackIconUrl: 'https://x/knight.png',
      rarity: undefined,
    });
  });

  it('keeps wiki artwork when the API reports no image', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14 })).toMatchObject({
      iconUrl: 'https://static.wikia.nocookie.net/clashroyale/images/5/54/KnightCard.png',
      fallbackIconUrl: undefined,
    });
  });

  it('keeps normal artwork for an Evolution-capable card outside an Evolution slot', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14, evolutionLevel: 1 }).iconUrl).toBe(
      'https://static.wikia.nocookie.net/clashroyale/images/5/54/KnightCard.png',
    );
  });

  it('keeps normal artwork when an Evolution slot has no unlocked Evolution', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14, evolutionLevel: 0 }, new Map(), true).iconUrl).toBe(
      'https://static.wikia.nocookie.net/clashroyale/images/5/54/KnightCard.png',
    );
  });

  it('lower-cases rarity carried directly on the card', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14, rarity: 'Rare' }).rarity).toBe('rare');
  });

  it('falls back to the rarity reference map by card id', () => {
    expect(mapCard({ id: 1, name: 'Knight', level: 10, maxLevel: 14 }, new Map([[1, 'Legendary']])).rarity).toBe('legendary');
  });
});

describe('clashRoyaleWikiCardImageUrl', () => {
  it('uses the normal wiki card filename for standard cards and Heroes', () => {
    expect(clashRoyaleWikiCardImageUrl('Archer Queen')).toBe('https://static.wikia.nocookie.net/clashroyale/images/7/72/ArcherQueenCard.png');
  });

  it('uses the evolution wiki filename and strips card-name punctuation', () => {
    expect(clashRoyaleWikiCardImageUrl('Cannon', 1)).toBe('https://static.wikia.nocookie.net/clashroyale/images/3/33/CannonCardEvolution.png');
    expect(clashRoyaleWikiCardImageUrl('Cannon', 0)).toBe('https://static.wikia.nocookie.net/clashroyale/images/7/70/CannonCard.png');
    expect(clashRoyaleWikiCardImageUrl('P.E.K.K.A')).toBe('https://static.wikia.nocookie.net/clashroyale/images/f/fe/PEKKACard.png');
  });
});

describe('isEvolutionDeckSlot', () => {
  it('limits Evolution artwork to the Evolution and mixed special slots', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].filter(isEvolutionDeckSlot)).toEqual([0, 2]);
  });
});

describe('findDeckHero', () => {
  it('recovers the one special-slot card from a battle matching all seven regular cards', () => {
    const deck = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `Card ${index + 1}`, level: 14, maxLevel: 14 }));
    const hero = { id: 99, name: 'Archer Queen', level: 6, maxLevel: 6 };
    expect(findDeckHero('#PLAYER', deck, [{ battleTime: '20260721T120000.000Z', type: 'pathOfLegend', team: [{ tag: '#PLAYER', crowns: 1, cards: [deck[0], hero, ...deck.slice(1)] }], opponent: [{ crowns: 0 }] }])).toEqual({ card: hero, index: 1 });
  });

  it('does not take a card from a battle with a different regular deck', () => {
    const deck = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `Card ${index + 1}`, level: 14, maxLevel: 14 }));
    expect(findDeckHero('#PLAYER', deck, [{ battleTime: '20260721T120000.000Z', type: 'pathOfLegend', team: [{ tag: '#PLAYER', crowns: 1, cards: [{ ...deck[0], id: 77 }, ...deck.slice(1), { id: 99, name: 'Archer Queen', level: 6, maxLevel: 6 }] }], opponent: [{ crowns: 0 }] }])).toBeUndefined();
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

  it('fetches player and battle log, encoding the tag once each', async () => {
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
          clan: { tag: '#CLAN1', name: 'Synthetic Clan', clanScore: 1234, badgeId: 16000044 },
          currentDeck: [{ id: 1, name: 'Knight', level: 10, maxLevel: 14 }],
          currentDeckSupportCards: [{ id: 101, name: 'Tower Princess', level: 16, maxLevel: 16 }],
          currentPathOfLegendSeasonResult: { leagueNumber: 5, trophies: 0, rank: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { battleTime: '20260721T120000.000Z', type: 'PvP', team: [{ crowns: 1 }], opponent: [{ crowns: 0 }] },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 1, rarity: 'Common' }] }))
      .mockResolvedValueOnce(jsonResponse([{ id: 16000044, name: 'Synthetic_Badge' }]));

    const provider = createClashRoyaleProvider({ apiKey: 'key', playerTag: 'abc123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const call of fetchMock.mock.calls.slice(0, 2)) {
      expect(String(call[0])).toContain('%23ABC123');
    }
    expect(data.profile.name).toBe('Player');
    expect(data.profile).toMatchObject({
      clanName: 'Synthetic Clan',
      clanTag: '#CLAN1',
      clanScore: 1234,
      clanBadgeUrl: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/badges/Synthetic_Badge.png',
    });
    expect(data.profile.pathOfLegends).toEqual({ leagueNumber: 5, trophies: 0, rank: null });
    expect(data.towerTroop?.name).toBe('Tower Princess');
    expect(data.recentBattles).toHaveLength(1);
    expect(data.currentDeck[0]).toMatchObject({ rarity: 'common' });
    fetchMock.mockRestore();
  });

  it('still returns data if the card rarity reference lookup fails', async () => {
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
          currentDeck: [{ id: 1, name: 'Knight', level: 10, maxLevel: 14 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({}, 500));

    const provider = createClashRoyaleProvider({ apiKey: 'key', playerTag: 'abc123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.currentDeck[0].rarity).toBeUndefined();
    fetchMock.mockRestore();
  });
});
