import { describe, expect, it, vi } from 'vitest';
import { createActivityPushProvider, latestClashOfClansAttack, latestClashRoyaleActivity } from './activityPush.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('latestClashRoyaleActivity', () => {
  it('keeps only the latest battle fields Batabiboing needs', () => {
    expect(latestClashRoyaleActivity({
      recentBattles: [{
        battleTime: '2026-07-23T18:00:00.000Z',
        type: 'pathOfLegend',
        result: 'win',
        crownsFor: 3,
        crownsAgainst: 1,
        opponentName: 'Private opponent',
      }],
    })).toEqual({
      result: 'win',
      crownsFor: 3,
      crownsAgainst: 1,
      timestamp: '2026-07-23T18:00:00.000Z',
    });
  });

  it('returns null when the Clash Royale source has no battles yet', () => {
    expect(latestClashRoyaleActivity({ recentBattles: [] })).toBeNull();
  });
});

describe('latestClashOfClansAttack', () => {
  const auth = { apiKey: 'key', playerTag: 'abc123' };

  it('finds the player\'s last attack and the matching defender\'s town hall', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ tag: '#ABC123', clan: { tag: '#CLAN1' } }))
      .mockResolvedValueOnce(jsonResponse({
        clan: { members: [{ tag: '#ABC123', attacks: [
          { order: 1, stars: 2, destructionPercentage: 55, defenderTag: '#OLD' },
          { order: 2, stars: 3, destructionPercentage: 100, defenderTag: '#NEW' },
        ] }] },
        opponent: { members: [{ tag: '#NEW', townhallLevel: 13 }] },
      }));

    const result = await latestClashOfClansAttack(new AbortController().signal, auth);

    expect(String(fetchMock.mock.calls[0][0])).toContain('%23ABC123');
    expect(String(fetchMock.mock.calls[1][0])).toContain('%23CLAN1');
    expect(result).toEqual({
      attack: { stars: 3, destructionPercentage: 100, defenderTownHall: 13, timestamp: expect.any(String) },
      key: '#NEW:2',
    });
    fetchMock.mockRestore();
  });

  it('returns null without erroring when there is no current war (404)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ tag: '#ABC123', clan: { tag: '#CLAN1' } }))
      .mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(latestClashOfClansAttack(new AbortController().signal, auth)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null when the player has not attacked yet this war', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ tag: '#ABC123', clan: { tag: '#CLAN1' } }))
      .mockResolvedValueOnce(jsonResponse({ clan: { members: [{ tag: '#ABC123', attacks: [] }] }, opponent: { members: [] } }));

    await expect(latestClashOfClansAttack(new AbortController().signal, auth)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null when the player has no clan', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ tag: '#ABC123' }));

    await expect(latestClashOfClansAttack(new AbortController().signal, auth)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('throws on a genuine GetPlayer failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(latestClashOfClansAttack(new AbortController().signal, auth)).rejects.toThrow('HTTP 500');
    fetchMock.mockRestore();
  });
});

describe('createActivityPushProvider Clash of Clans dedupe', () => {
  const push = { url: 'https://push.example/api', secret: 'shh' };
  const auth = { apiKey: 'key', playerTag: 'abc123' };

  function mockCocFetches(attack: { order: number; stars: number; destructionPercentage: number; defenderTag: string }) {
    return [
      jsonResponse({ tag: '#ABC123', clan: { tag: '#CLAN1' } }),
      jsonResponse({ clan: { members: [{ tag: '#ABC123', attacks: [attack] }] }, opponent: { members: [] } }),
    ];
  }

  it('sends the attack once, then omits it as long as it stays the newest one', async () => {
    const attack = { order: 1, stars: 3, destructionPercentage: 100, defenderTag: '#OPP' };
    const [player1, war1] = mockCocFetches(attack);
    const [player2, war2] = mockCocFetches(attack);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(player1)
      .mockResolvedValueOnce(war1)
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(player2)
      .mockResolvedValueOnce(war2)
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);
    await provider.fetch(new AbortController().signal, false);

    const bodies = fetchMock.mock.calls.filter((call) => call[0] === push.url).map((call) => JSON.parse(call[1]?.body as string));
    expect(bodies[0].clashOfClans).toMatchObject({ stars: 3, destructionPercentage: 100 });
    expect(bodies[1].clashOfClans).toBeNull();
    fetchMock.mockRestore();
  });

  it('does not mark the attack as sent when the push itself fails', async () => {
    const attack = { order: 1, stars: 2, destructionPercentage: 80, defenderTag: '#OPP' };
    const [player1, war1] = mockCocFetches(attack);
    const [player2, war2] = mockCocFetches(attack);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(player1)
      .mockResolvedValueOnce(war1)
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(player2)
      .mockResolvedValueOnce(war2)
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const provider = createActivityPushProvider(push, () => undefined, auth);
    await expect(provider.fetch(new AbortController().signal, false)).rejects.toThrow('HTTP 500');
    await provider.fetch(new AbortController().signal, false);

    const bodies = fetchMock.mock.calls.filter((call) => call[0] === push.url).map((call) => JSON.parse(call[1]?.body as string));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].clashOfClans).toMatchObject({ stars: 2 });
    fetchMock.mockRestore();
  });
});
