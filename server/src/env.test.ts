import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSteam } from './env.js';

describe('parseSteam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is undefined when neither credential is set', () => {
    vi.stubEnv('STEAM_API_KEY', '');
    vi.stubEnv('STEAM_ID', '');
    expect(parseSteam()).toBeUndefined();
  });

  it('is undefined when only the API key is set', () => {
    vi.stubEnv('STEAM_API_KEY', 'test-key');
    vi.stubEnv('STEAM_ID', '');
    expect(parseSteam()).toBeUndefined();
  });

  it('is undefined when only the SteamID is set', () => {
    vi.stubEnv('STEAM_API_KEY', '');
    vi.stubEnv('STEAM_ID', '76561198000000000');
    expect(parseSteam()).toBeUndefined();
  });

  it('is undefined when STEAM_ID is not a 17-digit numeric SteamID64', () => {
    vi.stubEnv('STEAM_API_KEY', 'test-key');
    vi.stubEnv('STEAM_ID', 'not-a-steam-id');
    expect(parseSteam()).toBeUndefined();
  });

  it('is undefined when STEAM_ID has the wrong digit count', () => {
    vi.stubEnv('STEAM_API_KEY', 'test-key');
    vi.stubEnv('STEAM_ID', '123456789');
    expect(parseSteam()).toBeUndefined();
  });

  it('returns credentials when both are set and STEAM_ID is a valid SteamID64', () => {
    vi.stubEnv('STEAM_API_KEY', 'test-key');
    vi.stubEnv('STEAM_ID', '76561198000000000');
    expect(parseSteam()).toEqual({ apiKey: 'test-key', steamId: '76561198000000000' });
  });
});
