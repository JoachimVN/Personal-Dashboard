import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSteam } from './env.js';

describe('parseSteam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['neither credential is set', '', ''],
    ['only the API key is set', 'test-key', ''],
    ['only the SteamID is set', '', '76561198000000000'],
    ['STEAM_ID is not a 17-digit numeric SteamID64', 'test-key', 'not-a-steam-id'],
    ['STEAM_ID has the wrong digit count', 'test-key', '123456789'],
  ])('is undefined when %s', (_description, apiKey, steamId) => {
    vi.stubEnv('STEAM_API_KEY', apiKey);
    vi.stubEnv('STEAM_ID', steamId);
    expect(parseSteam()).toBeUndefined();
  });

  it('returns credentials when both are set and STEAM_ID is a valid SteamID64', () => {
    vi.stubEnv('STEAM_API_KEY', 'test-key');
    vi.stubEnv('STEAM_ID', '76561198000000000');
    expect(parseSteam()).toEqual({ apiKey: 'test-key', steamId: '76561198000000000' });
  });
});
