import { describe, expect, it, vi } from 'vitest';
import { createRobloxProvider, resolveUserId } from './roblox.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Routes each mocked fetch call by a substring of its URL, independent of call order — safer
 * than positional mockResolvedValueOnce chains given the provider fans out with Promise.all. */
function routedFetch(routes: [string, () => Response][]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const match = routes.find(([substring]) => url.includes(substring));
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return match[1]();
  });
}

describe('resolveUserId', () => {
  it('passes a purely numeric id straight through without a network call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(resolveUserId(new AbortController().signal, '123456')).resolves.toBe(123456);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('resolves a username via the POST username-lookup endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ data: [{ id: 999 }] }));
    await expect(resolveUserId(new AbortController().signal, 'someUser')).resolves.toBe(999);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://users.roblox.com/v1/usernames/users');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ usernames: ['someUser'], excludeBannedUsers: false });
    fetchMock.mockRestore();
  });

  it('throws when the username has no match', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(resolveUserId(new AbortController().signal, 'ghost')).rejects.toThrow('no match');
    fetchMock.mockRestore();
  });
});

describe('createRobloxProvider', () => {
  it('is unconfigured without auth', () => {
    expect(createRobloxProvider(undefined).isConfigured()).toBe(false);
  });

  it('is unconfigured without a session cookie — presence requires it', () => {
    expect(createRobloxProvider({ idOrUsername: '123' }).isConfigured()).toBe(false);
  });

  it('resolves presence via the CSRF handshake (403 + token, then a successful retry)', async () => {
    let presenceAttempt = 0;
    const fetchMock = routedFetch([
      [
        'presence.roblox.com/v1/presence/users',
        () => {
          presenceAttempt += 1;
          if (presenceAttempt === 1) return new Response(null, { status: 403, headers: { 'x-csrf-token': 'tok' } });
          return jsonResponse({ userPresences: [{ userPresenceType: 1, lastLocation: '' }] });
        },
      ],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'cookie-value' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(presenceAttempt).toBe(2);
    expect(data.presence).toEqual({ status: 'online', gameName: '', lastOnline: undefined, placeId: undefined, iconUrl: undefined, thumbnailUrl: undefined });
    expect(data.availability).toBe('available');
    fetchMock.mockRestore();
  });

  it('regression: real Roblox responses send explicit null (not omitted) for inapplicable fields', async () => {
    const fetchMock = routedFetch([
      [
        'presence.roblox.com/v1/presence/users',
        () => jsonResponse({
          userPresences: [{
            userPresenceType: 1, lastLocation: null, lastOnline: null, rootPlaceId: null, universeId: null,
          }],
        }),
      ],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'cookie-value' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.presence).toEqual({ status: 'online', gameName: undefined, lastOnline: undefined, placeId: undefined, iconUrl: undefined, thumbnailUrl: undefined });
    expect(data.availability).toBe('available');
    fetchMock.mockRestore();
  });

  it('fetches game art and stats when actually in-game', async () => {
    const fetchMock = routedFetch([
      [
        'presence.roblox.com/v1/presence/users',
        () => jsonResponse({
          userPresences: [{ userPresenceType: 2, lastLocation: 'Adopt Me!', rootPlaceId: 920587237, universeId: 555 }],
        }),
      ],
      ['thumbnails.roblox.com/v1/games/icons', () => jsonResponse({ data: [{ targetId: 555, imageUrl: 'https://icon' }] })],
      ['thumbnails.roblox.com/v1/games/multiget/thumbnails', () => jsonResponse({ data: [{ universeId: 555, thumbnails: [{ imageUrl: 'https://thumb' }] }] })],
      ['games.roblox.com/v1/games', () => jsonResponse({ data: [{ playing: 12345, visits: 987654321 }] })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'cookie-value' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.presence).toEqual({
      status: 'in-game', gameName: 'Adopt Me!', lastOnline: undefined,
      placeId: 920587237, iconUrl: 'https://icon', thumbnailUrl: 'https://thumb',
      playing: 12345, visits: 987654321,
    });
    fetchMock.mockRestore();
  });

  it('regression: a failed game-context lookup still shows presence, just without art or stats', async () => {
    const fetchMock = routedFetch([
      [
        'presence.roblox.com/v1/presence/users',
        () => jsonResponse({ userPresences: [{ userPresenceType: 2, lastLocation: 'Adopt Me!', universeId: 555 }] }),
      ],
      ['thumbnails.roblox.com/v1/games/icons', () => new Response(null, { status: 500 })],
      ['thumbnails.roblox.com/v1/games/multiget/thumbnails', () => new Response(null, { status: 500 })],
      ['games.roblox.com/v1/games', () => new Response(null, { status: 500 })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'cookie-value' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.presence?.gameName).toBe('Adopt Me!');
    expect(data.presence?.iconUrl).toBeUndefined();
    expect(data.presence?.thumbnailUrl).toBeUndefined();
    expect(data.presence?.playing).toBeUndefined();
    expect(data.presence?.visits).toBeUndefined();
    fetchMock.mockRestore();
  });

  it('marks presence unauthorized when the cookie is rejected outright', async () => {
    const fetchMock = routedFetch([
      ['presence.roblox.com/v1/presence/users', () => new Response(null, { status: 401 })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'expired-cookie' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.presence).toBeNull();
    expect(data.availability).toBe('unauthorized');
    fetchMock.mockRestore();
  });
});
