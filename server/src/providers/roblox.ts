import { robloxSchema, type RobloxBadge, type RobloxData, type RobloxGame } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const RECENT_BADGES_COUNT = 10;
const GAMES_PER_LIST = 10;

export interface RobloxAuth {
  idOrUsername: string;
  robloSecurity?: string;
}

interface RawUser {
  id: number;
  name: string;
  displayName: string;
}

/** The badge-listing endpoint itself has no award date — that comes from a separate
 * /badges/awarded-dates call, merged in by fetchBadges below. */
interface RawBadge {
  id: number;
  name: string;
  displayIconImageId?: string;
}

interface RawGame {
  id: number;
  name: string;
}

interface RawUniverseThumbnail {
  targetId: number;
  imageUrl?: string;
  state: string;
}

/** Roblox's presence status codes: 0 offline, 1 online, 2 in-game, 3 in-studio. */
const PRESENCE_STATUS = ['offline', 'online', 'in-game', 'in-studio'] as const;

class RobloxHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `robloSecurity` is optional — most of these reads used to be fully public, but Roblox has been
 * gradually gating more legacy v1 endpoints (e.g. badges) behind auth, so the cookie is attached
 * whenever it's configured even for calls that don't strictly require it. */
async function robloxGet<T>(signal: AbortSignal, url: string, label: string, robloSecurity?: string): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: robloSecurity ? { Cookie: `.ROBLOSECURITY=${robloSecurity}` } : undefined,
  });
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Roblox requires a CSRF handshake for authenticated POSTs: the first request (with no token) is
 * rejected with 403 and an `x-csrf-token` response header, which is then replayed on a retry. Never
 * logs the cookie or any header — only the label and status code, matching the sanitization the
 * rest of the codebase applies to authenticated providers. */
async function robloxAuthedPost<T>(
  signal: AbortSignal,
  robloSecurity: string,
  url: string,
  body: unknown,
  label: string,
): Promise<T> {
  const baseHeaders = { 'Content-Type': 'application/json', Cookie: `.ROBLOSECURITY=${robloSecurity}` };
  const attempt = async (csrfToken?: string) =>
    fetch(url, {
      method: 'POST',
      signal,
      headers: csrfToken ? { ...baseHeaders, 'x-csrf-token': csrfToken } : baseHeaders,
      body: JSON.stringify(body),
    });

  let res = await attempt();
  if (res.status === 403) {
    const csrfToken = res.headers.get('x-csrf-token');
    if (!csrfToken) throw new RobloxHttpError(`Roblox ${label} CSRF handshake failed`, 403);
    res = await attempt(csrfToken);
  }
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Unlike the CSRF-guarded authenticated endpoints, username lookup is a public POST — no
 * cookie, no CSRF handshake. */
async function robloxPost<T>(signal: AbortSignal, url: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function resolveUserId(signal: AbortSignal, idOrUsername: string): Promise<number> {
  if (/^\d+$/.test(idOrUsername)) return Number(idOrUsername);
  const data = await robloxPost<{ data: { id: number }[] }>(
    signal,
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [idOrUsername], excludeBannedUsers: false },
    'username lookup',
  );
  const match = data.data[0];
  if (!match) throw new Error('Roblox username lookup returned no match');
  return match.id;
}

async function fetchProfile(signal: AbortSignal, userId: number): Promise<{ profile: RobloxData['profile']; friendsCount: number }> {
  const [user, avatar, friendsCount] = await Promise.all([
    robloxGet<RawUser>(signal, `https://users.roblox.com/v1/users/${userId}`, 'GetUser'),
    robloxGet<{ data: { imageUrl?: string }[] }>(
      signal,
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      'GetAvatar',
    ).then((data) => data.data[0]?.imageUrl),
    robloxGet<{ count: number }>(signal, `https://friends.roblox.com/v1/users/${userId}/friends/count`, 'GetFriendsCount').then(
      (data) => data.count,
    ),
  ]);
  return {
    profile: { userId: user.id, username: user.name, displayName: user.displayName, avatarUrl: avatar },
    friendsCount,
  };
}

type FetchResult<T> = { status: 'available'; data: T } | { status: 'unavailable' | 'unauthorized' };

function toFetchStatus(err: unknown): 'unavailable' | 'unauthorized' {
  return err instanceof RobloxHttpError && (err.status === 401 || err.status === 403) ? 'unauthorized' : 'unavailable';
}

/** The badge-listing endpoint returns no award date; it lives on this separate endpoint, keyed by
 * badge id. Best-effort — a failure here still shows badges, just without a "when" readout. */
async function fetchBadgeAwardedDates(
  signal: AbortSignal,
  userId: number,
  badgeIds: number[],
  robloSecurity?: string,
): Promise<Map<number, string>> {
  if (badgeIds.length === 0) return new Map();
  try {
    const data = await robloxGet<{ data: { badgeId: number; awardedDate: string }[] }>(
      signal,
      `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates?badgeIds=${badgeIds.join(',')}`,
      'GetBadgeAwardedDates',
      robloSecurity,
    );
    return new Map(data.data.map((entry) => [entry.badgeId, entry.awardedDate]));
  } catch {
    return new Map();
  }
}

/** Roblox started gating this endpoint behind auth at some point — degrades independently rather
 * than taking the whole provider down, same as presence/favorites. */
async function fetchBadges(signal: AbortSignal, userId: number, robloSecurity?: string): Promise<FetchResult<RobloxBadge[]>> {
  try {
    const data = await robloxGet<{ data: RawBadge[] }>(
      signal,
      `https://badges.roblox.com/v1/users/${userId}/badges?limit=${RECENT_BADGES_COUNT}&sortOrder=Desc`,
      'GetBadges',
      robloSecurity,
    );
    const badgeIds = data.data.map((b) => b.id);
    const [icons, awardedDates] = await Promise.all([
      badgeIds.length
        ? robloxGet<{ data: { targetId: number; imageUrl?: string }[] }>(
            signal,
            `https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${badgeIds.join(',')}&size=150x150&format=Png`,
            'GetBadgeIcons',
            robloSecurity,
          ).then((res) => new Map(res.data.map((entry) => [entry.targetId, entry.imageUrl])))
        : Promise.resolve(new Map<number, string | undefined>()),
      fetchBadgeAwardedDates(signal, userId, badgeIds, robloSecurity),
    ]);
    return {
      status: 'available',
      data: data.data.map((badge) => ({
        id: badge.id,
        name: badge.name,
        iconUrl: icons.get(badge.id),
        awardedAt: awardedDates.get(badge.id),
      })),
    };
  } catch (err) {
    return { status: toFetchStatus(err) };
  }
}

async function fetchGameIcons(signal: AbortSignal, universeIds: number[]): Promise<Map<number, string | undefined>> {
  if (universeIds.length === 0) return new Map();
  const data = await robloxGet<{ data: RawUniverseThumbnail[] }>(
    signal,
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds.join(',')}&size=150x150&format=Png`,
    'GetGameIcons',
  );
  return new Map(data.data.map((entry) => [entry.targetId, entry.imageUrl]));
}

async function fetchCreatedGames(signal: AbortSignal, userId: number, robloSecurity?: string): Promise<FetchResult<RobloxGame[]>> {
  try {
    const data = await robloxGet<{ data: RawGame[] }>(
      signal,
      `https://games.roblox.com/v1/users/${userId}/games?limit=${GAMES_PER_LIST}`,
      'GetCreatedGames',
      robloSecurity,
    );
    const icons = await fetchGameIcons(signal, data.data.map((g) => g.id));
    return {
      status: 'available',
      data: data.data.map((game) => ({ id: game.id, name: game.name, iconUrl: icons.get(game.id), relation: 'created' as const })),
    };
  } catch (err) {
    return { status: toFetchStatus(err) };
  }
}

async function fetchFavoriteGames(signal: AbortSignal, userId: number, robloSecurity: string): Promise<FetchResult<RobloxGame[]>> {
  try {
    const data = await robloxGet<{ data: RawGame[] }>(
      signal,
      `https://games.roblox.com/v1/users/${userId}/favorite/games?limit=${GAMES_PER_LIST}`,
      'GetFavoriteGames',
      robloSecurity,
    );
    const icons = await fetchGameIcons(signal, data.data.map((g) => g.id));
    return {
      status: 'available',
      data: data.data.map((game) => ({ id: game.id, name: game.name, iconUrl: icons.get(game.id), relation: 'favorite' as const })),
    };
  } catch (err) {
    return { status: toFetchStatus(err) };
  }
}

async function fetchPresence(signal: AbortSignal, userId: number, robloSecurity: string): Promise<FetchResult<RobloxData['presence']>> {
  try {
    const data = await robloxAuthedPost<{
      userPresences: { userPresenceType: number; lastLocation?: string; lastOnline?: string }[];
    }>(signal, robloSecurity, 'https://presence.roblox.com/v1/presence/users', { userIds: [userId] }, 'GetPresence');
    const entry = data.userPresences[0];
    if (!entry) return { status: 'unavailable' };
    return {
      status: 'available',
      data: {
        status: PRESENCE_STATUS[entry.userPresenceType] ?? 'offline',
        gameName: entry.lastLocation,
        lastOnline: entry.lastOnline,
      },
    };
  } catch (err) {
    return { status: toFetchStatus(err) };
  }
}

export function createRobloxProvider(auth: RobloxAuth | undefined): Provider<RobloxData> {
  return {
    id: 'roblox',
    schema: robloxSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 15_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('roblox is not configured');

      const userId = await resolveUserId(signal, auth.idOrUsername);
      // Profile is the one failure that takes the whole provider down — everything else below
      // degrades independently so one gated/broken Roblox endpoint doesn't blank the whole card.
      const { profile, friendsCount } = await fetchProfile(signal, userId);

      const [badges, createdGames] = await Promise.all([
        fetchBadges(signal, userId, auth.robloSecurity),
        fetchCreatedGames(signal, userId, auth.robloSecurity),
      ]);
      const favorites = auth.robloSecurity
        ? await fetchFavoriteGames(signal, userId, auth.robloSecurity)
        : ({ status: 'unavailable' } as const);
      const presenceResult = auth.robloSecurity
        ? await fetchPresence(signal, userId, auth.robloSecurity)
        : ({ status: 'unavailable' } as const);

      const games = [
        ...(createdGames.status === 'available' ? createdGames.data : []),
        ...(favorites.status === 'available' ? favorites.data : []),
      ];

      const data: RobloxData = {
        profile,
        presence: presenceResult.status === 'available' ? presenceResult.data : null,
        friendsCount,
        recentBadges: badges.status === 'available' ? badges.data : [],
        games,
        availability: {
          presence: presenceResult.status,
          badges: badges.status,
          createdGames: createdGames.status,
          favoriteGames: favorites.status,
        },
      };

      return robloxSchema.parse(data);
    },
  };
}
