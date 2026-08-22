import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  createActivityPushProvider,
  detectClashOfClansMilestones,
  latestClashOfClansAttack,
  latestClashOfClansRaidAttack,
  latestClashRoyaleActivity,
} from './activityPush.js';

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
  const player = { tag: '#ABC123', clan: { tag: '#CLAN1' } };

  it('finds the player\'s last attack and the matching defender\'s town hall', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      clan: { members: [{ tag: '#ABC123', attacks: [
        { order: 1, stars: 2, destructionPercentage: 55, defenderTag: '#OLD' },
        { order: 2, stars: 3, destructionPercentage: 100, defenderTag: '#NEW' },
      ] }] },
      opponent: { members: [{ tag: '#NEW', townhallLevel: 13 }] },
    }));

    const result = await latestClashOfClansAttack(new AbortController().signal, 'key', player);

    expect(String(fetchMock.mock.calls[0][0])).toContain('%23CLAN1');
    expect(result).toEqual({
      attack: { stars: 3, destructionPercentage: 100, defenderTownHall: 13, timestamp: expect.any(String) },
      key: '#NEW:2',
    });
    fetchMock.mockRestore();
  });

  it('falls back to the current Clan War League round when classic war reports notInWar', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ state: 'notInWar', clan: { members: [] }, opponent: { members: [] } }))
      .mockResolvedValueOnce(jsonResponse({ rounds: [{ warTags: ['#0', '#0'] }, { warTags: ['#WAR1'] }] }))
      .mockResolvedValueOnce(jsonResponse({
        state: 'inWar',
        clan: { tag: '#CLAN1', members: [{ tag: '#ABC123', attacks: [{ order: 1, stars: 3, destructionPercentage: 100, defenderTag: '#OPP' }] }] },
        opponent: { tag: '#OPP_CLAN', members: [{ tag: '#OPP', townhallLevel: 14 }] },
      }));

    const result = await latestClashOfClansAttack(new AbortController().signal, 'key', player);

    expect(String(fetchMock.mock.calls[1][0])).toContain('leaguegroup');
    expect(String(fetchMock.mock.calls[2][0])).toContain('%23WAR1');
    expect(result).toEqual({
      attack: { stars: 3, destructionPercentage: 100, defenderTownHall: 14, timestamp: expect.any(String) },
      key: '#OPP:1',
    });
    fetchMock.mockRestore();
  });

  it('normalizes a CWL war so "clan" is always our own side, whichever way Supercell framed it', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ state: 'notInWar', clan: { members: [] }, opponent: { members: [] } }))
      .mockResolvedValueOnce(jsonResponse({ rounds: [{ warTags: ['#WAR1'] }] }))
      .mockResolvedValueOnce(jsonResponse({
        state: 'inWar',
        opponent: { tag: '#CLAN1', members: [{ tag: '#ABC123', attacks: [{ order: 5, stars: 2, destructionPercentage: 60, defenderTag: '#X' }] }] },
        clan: { tag: '#OPP_CLAN', members: [{ tag: '#X', townhallLevel: 12 }] },
      }));

    const result = await latestClashOfClansAttack(new AbortController().signal, 'key', player);

    expect(result?.key).toBe('#X:5');
    fetchMock.mockRestore();
  });

  it('returns null without erroring when there is no current war (404)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(latestClashOfClansAttack(new AbortController().signal, 'key', player)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null when the player has not attacked yet this war', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ clan: { members: [{ tag: '#ABC123', attacks: [] }] }, opponent: { members: [] } }));

    await expect(latestClashOfClansAttack(new AbortController().signal, 'key', player)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null when the player has no clan, without making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(latestClashOfClansAttack(new AbortController().signal, 'key', { tag: '#ABC123' })).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

describe('latestClashOfClansRaidAttack', () => {
  const player = { tag: '#ABC123', clan: { tag: '#CLAN1' } };

  it('finds the player\'s most recent raid attack (first entry in a district\'s attacks array)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      items: [{
        attackLog: [{
          defender: { tag: '#ENEMY', name: 'Enemy Clan' },
          districts: [{
            id: 70000000,
            name: 'Capital Peak',
            attacks: [
              { attacker: { tag: '#ABC123' }, destructionPercent: 100, stars: 3 },
              { attacker: { tag: '#ABC123' }, destructionPercent: 47, stars: 0 },
            ],
          }],
        }],
      }],
    }));

    const result = await latestClashOfClansRaidAttack(new AbortController().signal, 'key', player);

    expect(String(fetchMock.mock.calls[0][0])).toContain('%23CLAN1');
    expect(result).toEqual({
      attack: { stars: 3, destructionPercentage: 100, defenderClanName: 'Enemy Clan', districtName: 'Capital Peak', timestamp: expect.any(String) },
      key: '#ENEMY:70000000:100:3',
    });
    fetchMock.mockRestore();
  });

  it('returns null when there is no raid season data yet', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ items: [] }));

    await expect(latestClashOfClansRaidAttack(new AbortController().signal, 'key', player)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null without erroring on 403 (private clan)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(latestClashOfClansRaidAttack(new AbortController().signal, 'key', player)).resolves.toBeNull();
    fetchMock.mockRestore();
  });

  it('returns null when the player has no clan, without making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(latestClashOfClansRaidAttack(new AbortController().signal, 'key', { tag: '#ABC123' })).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

describe('detectClashOfClansMilestones', () => {
  const baseline = {
    townHallLevel: 17,
    builderHallLevel: 9,
    bestTrophies: 5000,
    bestBuilderBaseTrophies: 5300,
    leagueTierName: 'Champion League I',
    builderBaseLeagueName: 'Gold League I',
  };

  it('detects a town hall upgrade', () => {
    expect(detectClashOfClansMilestones(baseline, { ...baseline, townHallLevel: 18 })).toEqual([
      { type: 'townHallLevel', value: 18, timestamp: expect.any(String) },
    ]);
  });

  it('detects a new trophy record', () => {
    expect(detectClashOfClansMilestones(baseline, { ...baseline, bestTrophies: 5037 })).toEqual([
      { type: 'bestTrophies', value: 5037, timestamp: expect.any(String) },
    ]);
  });

  it('detects a league promotion', () => {
    expect(detectClashOfClansMilestones(baseline, { ...baseline, leagueTierName: 'Titan League 26' })).toEqual([
      { type: 'leagueTier', value: 'Titan League 26', timestamp: expect.any(String) },
    ]);
  });

  it('reports nothing when nothing changed', () => {
    expect(detectClashOfClansMilestones(baseline, { ...baseline })).toEqual([]);
  });

  it('reports every milestone hit in the same tick', () => {
    expect(detectClashOfClansMilestones(baseline, { ...baseline, townHallLevel: 18, bestTrophies: 5100 })).toHaveLength(2);
  });
});

describe('createActivityPushProvider Clash of Clans', () => {
  const push = { url: 'https://push.example/api', secret: 'shh' };
  const auth = { apiKey: 'key', playerTag: 'abc123' };

  function basePlayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      tag: '#ABC123',
      clan: { tag: '#CLAN1' },
      townHallLevel: 17,
      bestTrophies: 5000,
      warStars: 100,
      attackWins: 5,
      donations: 100,
      clanCapitalContributions: 1000,
      ...overrides,
    };
  }

  function mockCocApi(state: { player: unknown; war?: unknown; warStatus?: number; raid?: unknown; pushStatus?: number }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true }, state.pushStatus ?? 200);
      if (url.includes('/players/')) return jsonResponse(state.player);
      if (url.includes('/currentwar/leaguegroup')) return jsonResponse({ rounds: [] });
      if (url.includes('/currentwar')) return jsonResponse(state.war ?? {}, state.warStatus ?? 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse(state.raid ?? { items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  function pushBody(fetchMock: ReturnType<typeof vi.spyOn>, index: number) {
    const calls = fetchMock.mock.calls.filter((call) => call[0] === push.url);
    return JSON.parse(calls[index][1]?.body as string);
  }

  it('reports no activity or milestones on the first tick — only seeds the baselines', async () => {
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);

    await provider.fetch(new AbortController().signal, false);

    const body = pushBody(fetchMock, 0);
    expect(body.machine).toBe(os.hostname());
    expect(body.clashOfClansLastActiveAt).toBeNull();
    expect(body.clashOfClansMilestones).toEqual([]);
    fetchMock.mockRestore();
  });

  it('sets clashOfClansLastActiveAt once a counter increases, and keeps reporting it while unchanged', async () => {
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ donations: 150 }));
      if (url.includes('/currentwar')) return jsonResponse({}, 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);
    const activeAt = pushBody(fetchMock, 1).clashOfClansLastActiveAt;
    expect(activeAt).toEqual(expect.any(String));

    // Third tick: same donations count as the second tick — no new activity, but the timestamp
    // from the last real change should still be reported, not cleared.
    await provider.fetch(new AbortController().signal, false);
    expect(pushBody(fetchMock, 2).clashOfClansLastActiveAt).toBe(activeAt);
    fetchMock.mockRestore();
  });

  it('reports which counter increased, and ranks a war attack over a donation on a tied tick', async () => {
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ donations: 150, warStars: 103 }));
      if (url.includes('/currentwar')) return jsonResponse({}, 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 1).clashOfClansCounterActivity).toEqual({ type: 'warStars', delta: 3, timestamp: expect.any(String) });
    fetchMock.mockRestore();
  });

  it('omits clashOfClansCounterActivity once reported, until a counter increases again', async () => {
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ donations: 150 }));
      if (url.includes('/currentwar')) return jsonResponse({}, 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 1).clashOfClansCounterActivity).toEqual({ type: 'donations', delta: 50, timestamp: expect.any(String) });
    expect(pushBody(fetchMock, 2).clashOfClansCounterActivity).toBeNull();
    fetchMock.mockRestore();
  });

  it('does not treat a seasonal counter reset as activity', async () => {
    const fetchMock = mockCocApi({ player: basePlayer({ donations: 500 }) });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ donations: 0 })); // season reset
      if (url.includes('/currentwar')) return jsonResponse({}, 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 1).clashOfClansLastActiveAt).toBeNull();
    fetchMock.mockRestore();
  });

  it('reports a milestone once town hall level increases, not on the seeding tick', async () => {
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ townHallLevel: 18 }));
      if (url.includes('/currentwar')) return jsonResponse({}, 404);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 1).clashOfClansMilestones).toEqual([{ type: 'townHallLevel', value: 18, timestamp: expect.any(String) }]);
    fetchMock.mockRestore();
  });

  it('sends the raid attack once, then omits it as long as it stays the newest one', async () => {
    const raid = {
      items: [{
        attackLog: [{
          defender: { tag: '#ENEMY', name: 'Enemy Clan' },
          districts: [{ id: 1, name: 'District', attacks: [{ attacker: { tag: '#ABC123' }, destructionPercent: 100, stars: 3 }] }],
        }],
      }],
    };
    const fetchMock = mockCocApi({ player: basePlayer(), raid });
    const provider = createActivityPushProvider(push, () => undefined, auth);

    await provider.fetch(new AbortController().signal, false);
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 0).clashOfClansRaidAttack).toMatchObject({ stars: 3, defenderClanName: 'Enemy Clan' });
    expect(pushBody(fetchMock, 1).clashOfClansRaidAttack).toBeNull();
    fetchMock.mockRestore();
  });

  it('sends the war attack once, then omits it as long as it stays the newest one', async () => {
    const war = {
      clan: { members: [{ tag: '#ABC123', attacks: [{ order: 1, stars: 3, destructionPercentage: 100, defenderTag: '#OPP' }] }] },
      opponent: { members: [] },
    };
    const fetchMock = mockCocApi({ player: basePlayer(), war, warStatus: 200 });
    const provider = createActivityPushProvider(push, () => undefined, auth);

    await provider.fetch(new AbortController().signal, false);
    await provider.fetch(new AbortController().signal, false);

    expect(pushBody(fetchMock, 0).clashOfClans).toMatchObject({ stars: 3, destructionPercentage: 100 });
    expect(pushBody(fetchMock, 1).clashOfClans).toBeNull();
    fetchMock.mockRestore();
  });

  it('does not mark the attack or milestone as sent when the push itself fails, and retries next tick', async () => {
    const war = {
      clan: { members: [{ tag: '#ABC123', attacks: [{ order: 1, stars: 3, destructionPercentage: 100, defenderTag: '#OPP' }] }] },
      opponent: { members: [] },
    };
    const fetchMock = mockCocApi({ player: basePlayer() });
    const provider = createActivityPushProvider(push, () => undefined, auth);
    await provider.fetch(new AbortController().signal, false); // seed baselines

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({}, 500);
      if (url.includes('/players/')) return jsonResponse(basePlayer({ townHallLevel: 18 }));
      if (url.includes('/currentwar')) return jsonResponse(war, 200);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(provider.fetch(new AbortController().signal, false)).rejects.toThrow('HTTP 500');

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === push.url) return jsonResponse({ ok: true });
      if (url.includes('/players/')) return jsonResponse(basePlayer({ townHallLevel: 18 }));
      if (url.includes('/currentwar')) return jsonResponse(war, 200);
      if (url.includes('/capitalraidseasons')) return jsonResponse({ items: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await provider.fetch(new AbortController().signal, false);

    const body = pushBody(fetchMock, 2);
    expect(body.clashOfClans).toMatchObject({ stars: 3 });
    expect(body.clashOfClansMilestones).toEqual([{ type: 'townHallLevel', value: 18, timestamp: expect.any(String) }]);
    fetchMock.mockRestore();
  });
});
