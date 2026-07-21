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

const BASE_ROUTES: [string, () => Response][] = [
  ['users.roblox.com/v1/users/123', () => jsonResponse({ id: 123, name: 'user', displayName: 'User' })],
  ['thumbnails.roblox.com/v1/users/avatar-headshot', () => jsonResponse({ data: [{ imageUrl: 'https://avatar' }] })],
  ['friends.roblox.com/v1/users/123/friends/count', () => jsonResponse({ count: 42 })],
  ['badges.roblox.com/v1/users/123/badges/awarded-dates', () => jsonResponse({ data: [{ badgeId: 7, awardedDate: '2026-07-01T00:00:00.000Z' }] })],
  ['badges.roblox.com/v1/users/123/badges', () => jsonResponse({ data: [{ id: 7, name: 'Cool Badge' }] })],
  ['thumbnails.roblox.com/v1/badges/icons', () => jsonResponse({ data: [{ targetId: 7, imageUrl: 'https://badge-icon' }] })],
  ['games.roblox.com/v1/users/123/games', () => jsonResponse({ data: [] })],
];

describe('createRobloxProvider', () => {
  it('is unconfigured without auth', () => {
    expect(createRobloxProvider(undefined).isConfigured()).toBe(false);
  });

  it('fetches the public profile/badges/games without a cookie, leaving presence and favorites unavailable', async () => {
    const fetchMock = routedFetch(BASE_ROUTES);
    const provider = createRobloxProvider({ idOrUsername: '123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.profile).toEqual({ userId: 123, username: 'user', displayName: 'User', avatarUrl: 'https://avatar' });
    expect(data.friendsCount).toBe(42);
    expect(data.presence).toBeNull();
    expect(data.recentBadges).toEqual([
      { id: 7, name: 'Cool Badge', iconUrl: 'https://badge-icon', awardedAt: '2026-07-01T00:00:00.000Z' },
    ]);
    expect(data.availability).toEqual({
      presence: 'unavailable',
      badges: 'available',
      createdGames: 'available',
      favoriteGames: 'unavailable',
    });
    fetchMock.mockRestore();
  });

  it('still shows badges without an awarded date when the best-effort awarded-dates lookup fails', async () => {
    const fetchMock = routedFetch([
      ...BASE_ROUTES.filter(([substring]) => !substring.includes('awarded-dates')),
      ['badges.roblox.com/v1/users/123/badges/awarded-dates', () => new Response(null, { status: 500 })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.recentBadges).toEqual([{ id: 7, name: 'Cool Badge', iconUrl: 'https://badge-icon', awardedAt: undefined }]);
    expect(data.availability.badges).toBe('available');
    fetchMock.mockRestore();
  });

  it('regression: a gated badges endpoint (401, no cookie) degrades independently instead of failing the whole card', async () => {
    // Reproduces the real-world failure: Roblox started requiring auth on badges.roblox.com,
    // and before the fix this took down profile/friends/games alongside it.
    const fetchMock = routedFetch([
      ...BASE_ROUTES.filter(([substring]) => !substring.includes('badges.roblox.com')),
      ['badges.roblox.com/v1/users/123/badges', () => new Response(null, { status: 401 })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.profile.username).toBe('user');
    expect(data.friendsCount).toBe(42);
    expect(data.recentBadges).toEqual([]);
    expect(data.availability.badges).toBe('unauthorized');
    fetchMock.mockRestore();
  });

  it('resolves presence via the CSRF handshake (403 + token, then a successful retry)', async () => {
    let presenceAttempt = 0;
    const fetchMock = routedFetch([
      ...BASE_ROUTES,
      [
        'presence.roblox.com/v1/presence/users',
        () => {
          presenceAttempt += 1;
          if (presenceAttempt === 1) return new Response(null, { status: 403, headers: { 'x-csrf-token': 'tok' } });
          return jsonResponse({ userPresences: [{ userPresenceType: 2, lastLocation: 'Adopt Me!' }] });
        },
      ],
      ['games.roblox.com/v1/users/123/favorite/games', () => jsonResponse({ data: [] })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'cookie-value' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(presenceAttempt).toBe(2);
    expect(data.presence).toEqual({ status: 'in-game', gameName: 'Adopt Me!', lastOnline: undefined });
    expect(data.availability.presence).toBe('available');
    fetchMock.mockRestore();
  });

  it('marks presence and favorites unauthorized when the cookie is rejected outright', async () => {
    const fetchMock = routedFetch([
      ...BASE_ROUTES,
      ['presence.roblox.com/v1/presence/users', () => new Response(null, { status: 401 })],
      ['games.roblox.com/v1/users/123/favorite/games', () => new Response(null, { status: 401 })],
    ]);

    const provider = createRobloxProvider({ idOrUsername: '123', robloSecurity: 'expired-cookie' });
    const data = await provider.fetch(new AbortController().signal, false);

    expect(data.presence).toBeNull();
    expect(data.availability).toEqual({
      presence: 'unauthorized',
      badges: 'available',
      createdGames: 'available',
      favoriteGames: 'unauthorized',
    });
    fetchMock.mockRestore();
  });
});
