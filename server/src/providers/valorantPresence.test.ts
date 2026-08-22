import { describe, expect, it } from 'vitest';
import { parseLockfile, parseRiotOnline, parseValorantPresence } from './valorantPresence.js';

function presence(puuid: string, blob: unknown, product = 'valorant'): { puuid: string; product: string; private: string } {
  return { puuid, product, private: Buffer.from(JSON.stringify(blob)).toString('base64') };
}

describe('parseLockfile', () => {
  it('reads the port and password out of the colon-separated line', () => {
    expect(parseLockfile('Riot Client:12345:59889:sEcReT:https\n')).toEqual({ port: 59889, password: 'sEcReT' });
  });

  it('rejects a truncated lockfile rather than requesting against port NaN', () => {
    expect(parseLockfile('Riot Client:12345')).toBeUndefined();
    expect(parseLockfile('Riot Client:12345:not-a-port:sEcReT:https')).toBeUndefined();
    expect(parseLockfile('')).toBeUndefined();
  });
});

describe('parseValorantPresence', () => {
  it('reports a live match with its map, queue and current score', () => {
    expect(parseValorantPresence([presence('me', {
      matchPresenceData: { sessionLoopState: 'INGAME', matchMap: '/Game/Maps/Infinity/Infinity', queueId: 'competitive' },
      partyOwnerMatchScoreAllyTeam: 9,
      partyOwnerMatchScoreEnemyTeam: 7,
      partySize: 3,
      maxPartySize: 5,
    })], 'me')).toEqual({
      state: 'ingame',
      mapUrl: '/Game/Maps/Infinity/Infinity',
      queueId: 'competitive',
      roundsWon: 9,
      roundsLost: 7,
      partySize: 3,
      maxPartySize: 5,
      idle: false,
    });
  });

  it('drops the stale 0-0 score the menus report, since no round is being played', () => {
    const parsed = parseValorantPresence([presence('me', {
      matchPresenceData: { sessionLoopState: 'MENUS', matchMap: '', queueId: 'competitive' },
      partyOwnerMatchScoreAllyTeam: 0,
      partyOwnerMatchScoreEnemyTeam: 0,
    })], 'me');
    expect(parsed).toMatchObject({ state: 'menus', roundsWon: undefined, roundsLost: undefined, mapUrl: undefined });
  });

  it('recognises agent select as its own state', () => {
    expect(parseValorantPresence([presence('me', {
      matchPresenceData: { sessionLoopState: 'PREGAME', matchMap: '/Game/Maps/Triad/Triad', queueId: 'unrated' },
    })], 'me')?.state).toBe('pregame');
  });

  it('falls back to the nested party fields when the blob has no top-level party size', () => {
    expect(parseValorantPresence([presence('me', {
      matchPresenceData: { sessionLoopState: 'MENUS', queueId: 'swiftplay' },
      partyPresenceData: { partySize: 2, maxPartySize: 5 },
    })], 'me')).toMatchObject({ partySize: 2, maxPartySize: 5 });
  });

  it('ignores everyone else on the roster and the account\'s own non-Valorant presence', () => {
    const roster = [
      presence('friend', { matchPresenceData: { sessionLoopState: 'INGAME', queueId: 'competitive' } }),
      presence('me', { matchPresenceData: { sessionLoopState: 'INGAME', queueId: 'competitive' } }, 'league_of_legends'),
    ];
    expect(parseValorantPresence(roster, 'me')).toBeUndefined();
  });

  it('returns undefined for an undecodable or unknown-state blob instead of throwing', () => {
    expect(parseValorantPresence([{ puuid: 'me', product: 'valorant', private: 'not-base64-json' }], 'me')).toBeUndefined();
    expect(parseValorantPresence([presence('me', { matchPresenceData: { sessionLoopState: 'SOMETHING_NEW' } })], 'me')).toBeUndefined();
    expect(parseValorantPresence([], 'me')).toBeUndefined();
  });
});

describe('parseValorantPresence idle flag', () => {
  it('carries the away marking Riot sets through', () => {
    expect(parseValorantPresence([presence('me', {
      isIdle: true,
      matchPresenceData: { sessionLoopState: 'MENUS', queueId: 'competitive' },
    })], 'me')?.idle).toBe(true);
  });
});

describe('parseRiotOnline', () => {
  it('reports being signed in at the launcher when nothing is being played', () => {
    expect(parseRiotOnline([{ puuid: 'me', product: 'riot_client', state: 'chat' }], 'me')).toEqual({ idle: false });
  });

  it('marks away and do-not-disturb as idle', () => {
    expect(parseRiotOnline([{ puuid: 'me', product: 'riot_client', state: 'away' }], 'me')).toEqual({ idle: true });
    expect(parseRiotOnline([{ puuid: 'me', product: 'riot_client', state: 'dnd' }], 'me')).toEqual({ idle: true });
  });

  it('respects appearing offline rather than republishing it as online', () => {
    expect(parseRiotOnline([{ puuid: 'me', product: 'riot_client', state: 'offline' }], 'me')).toBeUndefined();
    expect(parseRiotOnline([{ puuid: 'me', product: 'riot_client', state: '' }], 'me')).toBeUndefined();
  });

  it('ignores client presence belonging to anyone else', () => {
    expect(parseRiotOnline([{ puuid: 'friend', product: 'riot_client', state: 'chat' }], 'me')).toBeUndefined();
  });
});
