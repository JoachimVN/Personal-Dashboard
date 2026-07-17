import {
  steamSchema,
  type SteamAchievement,
  type SteamData,
  type SteamFriend,
  type SteamGame,
  type SteamLeaderboardEntry,
  type SteamLockedAchievement,
} from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import type { SteamHistoryStore } from '../steamHistory.js';
import type {
  SteamAchievementPercentageEntry,
  SteamAchievementSchemaEntry,
  SteamLibrarySnapshot,
  SteamSnapshotStore,
} from '../steamSnapshot.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const RECENTLY_PLAYED_COUNT = 10;
const FRIEND_SUMMARY_CHUNK_SIZE = 100;
const MAX_FRIENDS_IN_GAME = 8;

const LIBRARY_CACHE_TTL_MS = 6 * 60 * 60_000;
const ACHIEVEMENT_SCHEMA_TTL_MS = 30 * 24 * 60 * 60_000;
const ACHIEVEMENT_PERCENTAGES_TTL_MS = 24 * 60 * 60_000;
const RARITY_SHOWCASE_COUNT = 5;

export interface SteamAuth {
  apiKey: string;
  steamId: string;
}

// --- raw Steam Web API response shapes (only the fields we use) ---

interface RawPlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull?: string;
  gameid?: string;
  gameextrainfo?: string;
}

interface RawGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
}

interface RawPlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

interface RawSchemaAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
}

interface RawGlobalPercentage {
  name: string;
  // Steam's API documents this as a number but serializes it as a string for some games.
  percent: number | string;
}

/** Thrown by steamRequest so callers can distinguish a privacy-driven HTTP 401 (e.g. a private
 * friends list) from a genuine network/server failure — both look like "the fetch threw", but only
 * one should be reported to the client as `'private'` rather than `'unavailable'`. */
class SteamHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Builds one documented Steam Web API endpoint, supplies the key via query params, and checks
 * both HTTP status and (by the caller) Steam's JSON-level success/error shape. Never throws a
 * message containing the URL — it carries the API key. */
async function steamRequest<T>(
  signal: AbortSignal,
  apiKey: string,
  path: string,
  params: Record<string, string>,
  label: string,
): Promise<T> {
  const url = new URL(`${STEAM_API_BASE}${path}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('format', 'json');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new SteamHttpError(`Steam ${label} failed: HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export function steamIconUrl(appId: number, imgIconUrl: string | undefined): string | undefined {
  if (!imgIconUrl) return undefined;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${imgIconUrl}.jpg`;
}

export function steamHeaderUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function unixSecondsToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export function mapGame(game: RawGame): SteamGame {
  return {
    appId: game.appid,
    name: game.name,
    iconUrl: steamIconUrl(game.appid, game.img_icon_url),
    headerUrl: steamHeaderUrl(game.appid),
    playtimeForeverMinutes: game.playtime_forever,
    playtimeRecentMinutes: game.playtime_2weeks,
  };
}

export function chunkFriendIds(ids: string[], size = FRIEND_SUMMARY_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Current game if playing, else the first (most recent) recently-played entry, else the
 * most-played library game — labeled the "tracked game" in the UI since Steam doesn't formally
 * guarantee recently-played ordering. The library fallback matters because Steam's
 * "recently played" is a strict last-2-weeks window: someone with a huge library but no play in
 * the last fortnight would otherwise get zero achievement tracking despite having plenty of
 * history to show. */
export function pickTrackedGame(
  currentGame: SteamGame | null,
  recentlyPlayed: SteamGame[],
  mostPlayed: SteamGame[] = [],
): { appId: number; name: string } | undefined {
  const game = currentGame ?? recentlyPlayed[0] ?? mostPlayed[0];
  return game ? { appId: game.appId, name: game.name } : undefined;
}

export function mergeAchievements(
  playerAchievements: RawPlayerAchievement[],
  schema: SteamAchievementSchemaEntry[],
  percentages: SteamAchievementPercentageEntry[],
): {
  unlockedCount: number;
  totalCount: number;
  recentUnlocks: SteamAchievement[];
  rarest: SteamAchievement[];
  nextEasiest: SteamLockedAchievement[];
} {
  const schemaByName = new Map(schema.map((entry) => [entry.apiName, entry]));
  const percentByName = new Map(percentages.map((entry) => [entry.apiName, entry.percent]));
  const unlocked = playerAchievements.filter((a) => a.achieved === 1);
  const unlockedNames = new Set(unlocked.map((a) => a.apiname));

  const toAchievement = (a: RawPlayerAchievement): SteamAchievement => {
    const def = schemaByName.get(a.apiname);
    return {
      apiName: a.apiname,
      displayName: def?.displayName ?? a.apiname,
      description: def?.description,
      iconUrl: def?.icon,
      unlockedAt: unixSecondsToIso(a.unlocktime),
      globalUnlockedPercent: percentByName.get(a.apiname),
    };
  };

  const recentUnlocks = unlocked.map(toAchievement).sort((a, b) => (a.unlockedAt < b.unlockedAt ? 1 : -1));

  const rarest = [...recentUnlocks]
    .filter((a) => a.globalUnlockedPercent !== undefined)
    .sort((a, b) => a.globalUnlockedPercent! - b.globalUnlockedPercent!)
    .slice(0, RARITY_SHOWCASE_COUNT);

  // "Most other players already have this, you don't yet" — locked achievements sorted by
  // descending global unlock rate.
  const nextEasiest: SteamLockedAchievement[] = schema
    .filter((entry) => !unlockedNames.has(entry.apiName))
    .map((entry) => ({
      apiName: entry.apiName,
      displayName: entry.displayName,
      description: entry.description,
      iconUrl: entry.icon,
      globalUnlockedPercent: percentByName.get(entry.apiName),
    }))
    .filter((entry) => entry.globalUnlockedPercent !== undefined)
    .sort((a, b) => b.globalUnlockedPercent! - a.globalUnlockedPercent!)
    .slice(0, RARITY_SHOWCASE_COUNT);

  return { unlockedCount: unlocked.length, totalCount: playerAchievements.length, recentUnlocks, rarest, nextEasiest };
}

function isExpired(fetchedAt: Date, ttlMs: number): boolean {
  return Date.now() - fetchedAt.getTime() > ttlMs;
}

async function fetchProfile(
  signal: AbortSignal,
  apiKey: string,
  steamId: string,
): Promise<{ profile: SteamData['profile']; currentGame: SteamGame | null }> {
  const data = await steamRequest<{ response?: { players?: RawPlayerSummary[] } }>(
    signal,
    apiKey,
    '/ISteamUser/GetPlayerSummaries/v2/',
    { steamids: steamId },
    'GetPlayerSummaries',
  );
  const player = data.response?.players?.[0];
  if (!player) throw new Error('Steam GetPlayerSummaries returned no profile');

  const currentGame: SteamGame | null = player.gameid
    ? {
        appId: Number(player.gameid),
        name: player.gameextrainfo ?? 'Playing a Steam game',
        headerUrl: steamHeaderUrl(Number(player.gameid)),
      }
    : null;

  return {
    profile: {
      steamId: player.steamid,
      personaName: player.personaname,
      avatarUrl: player.avatarfull,
      profileUrl: player.profileurl,
    },
    currentGame,
  };
}

async function fetchRecentlyPlayed(signal: AbortSignal, apiKey: string, steamId: string): Promise<SteamGame[]> {
  const data = await steamRequest<{ response?: { games?: RawGame[] } }>(
    signal,
    apiKey,
    '/IPlayerService/GetRecentlyPlayedGames/v1/',
    { steamid: steamId, count: String(RECENTLY_PLAYED_COUNT) },
    'GetRecentlyPlayedGames',
  );
  return (data.response?.games ?? []).map(mapGame);
}

type LibraryResult =
  | { status: 'available'; data: SteamLibrarySnapshot }
  | { status: 'private' }
  | { status: 'unavailable' };

async function fetchOwnedGames(signal: AbortSignal, apiKey: string, steamId: string): Promise<LibraryResult> {
  try {
    const data = await steamRequest<{ response?: { game_count?: number; games?: RawGame[] } }>(
      signal,
      apiKey,
      '/IPlayerService/GetOwnedGames/v1/',
      { steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true' },
      'GetOwnedGames',
    );
    const games = data.response?.games;
    // A private "Game details" setting returns HTTP 200 with an empty response object.
    if (!games) return { status: 'private' };

    const mapped = games.map(mapGame);
    const totalPlaytimeMinutes = mapped.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0);
    const recentPlaytimeMinutes = mapped.reduce((sum, g) => sum + (g.playtimeRecentMinutes ?? 0), 0);
    const allGames = [...mapped].sort((a, b) => (b.playtimeForeverMinutes ?? 0) - (a.playtimeForeverMinutes ?? 0));
    const mostPlayed = allGames.slice(0, 5);

    return {
      status: 'available',
      data: {
        totalGames: data.response?.game_count ?? mapped.length,
        totalPlaytimeMinutes,
        recentPlaytimeMinutes,
        mostPlayed,
        allGames,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

type FriendIdsResult = { status: 'available'; friendIds: string[] } | { status: 'private' } | { status: 'unavailable' };

async function fetchFriendIds(signal: AbortSignal, apiKey: string, steamId: string): Promise<FriendIdsResult> {
  try {
    const data = await steamRequest<{ friendslist?: { friends?: { steamid: string }[] } }>(
      signal,
      apiKey,
      '/ISteamUser/GetFriendList/v1/',
      { steamid: steamId, relationship: 'friend' },
      'GetFriendList',
    );
    const friends = data.friendslist?.friends;
    // An accessible-but-empty friends list is real; a missing friendslist despite a 200 covers any
    // other shape Steam might send for "nothing to show here".
    if (!friends) return { status: 'private' };
    return { status: 'available', friendIds: friends.map((f) => f.steamid) };
  } catch (err) {
    // A private friends list returns HTTP 401 — distinct from a genuine fetch/server failure.
    return { status: err instanceof SteamHttpError && err.status === 401 ? 'private' : 'unavailable' };
  }
}

/** Shared by "friends in game" and the leaderboard's name/avatar lookup, so a large friends list
 * only costs one chunked round of GetPlayerSummaries calls, not two. */
async function fetchPlayerSummaries(signal: AbortSignal, apiKey: string, steamIds: string[]): Promise<RawPlayerSummary[]> {
  const summaries: RawPlayerSummary[] = [];
  for (const chunk of chunkFriendIds(steamIds)) {
    const data = await steamRequest<{ response?: { players?: RawPlayerSummary[] } }>(
      signal,
      apiKey,
      '/ISteamUser/GetPlayerSummaries/v2/',
      { steamids: chunk.join(',') },
      'GetPlayerSummaries (friends)',
    );
    summaries.push(...(data.response?.players ?? []));
  }
  return summaries;
}

function deriveFriendsInGame(summaries: RawPlayerSummary[]): SteamFriend[] {
  return summaries
    .filter((p) => p.gameid)
    .slice(0, MAX_FRIENDS_IN_GAME)
    .map((p) => ({
      steamId: p.steamid,
      personaName: p.personaname,
      avatarUrl: p.avatarfull,
      appId: p.gameid ? Number(p.gameid) : undefined,
      gameName: p.gameextrainfo ?? 'Playing a Steam game',
    }));
}

/** Only appid + playtime is needed for the leaderboard, so `include_appinfo` stays off to keep
 * the payload small — unlike the user's own library fetch, which needs names/icons to display. */
async function fetchFriendLibraryTotal(
  signal: AbortSignal,
  apiKey: string,
  steamId: string,
): Promise<{ totalPlaytimeMinutes: number; recentPlaytimeMinutes: number; appIds: Set<number> } | undefined> {
  try {
    const data = await steamRequest<{ response?: { games?: RawGame[] } }>(
      signal,
      apiKey,
      '/IPlayerService/GetOwnedGames/v1/',
      { steamid: steamId, include_appinfo: 'false', include_played_free_games: 'true' },
      'GetOwnedGames (friend)',
    );
    const games = data.response?.games;
    if (!games) return undefined; // private "Game details" setting
    return {
      totalPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0),
      recentPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtime_2weeks ?? 0), 0),
      appIds: new Set(games.map((g) => g.appid)),
    };
  } catch {
    return undefined;
  }
}

/** Computes (or serves a cached copy of) a playtime leaderboard across your friends — each entry
 * costs an extra GetOwnedGames call, so this is capped to `maxFriends` and cached for `ttlMs`
 * rather than recomputed on every 5-minute poll. Friends with a private library still appear
 * (name only, unranked) rather than being dropped. */
async function getOrFetchFriendsLeaderboard(
  signal: AbortSignal,
  apiKey: string,
  ownProfile: SteamData['profile'],
  ownLibrary: SteamLibrarySnapshot | null,
  friendIds: string[],
  friendSummaries: RawPlayerSummary[],
  maxFriends: number,
  ttlMs: number,
  snapshotStore: SteamSnapshotStore | undefined,
): Promise<{ status: 'available' | 'unavailable'; entries: SteamLeaderboardEntry[] }> {
  const cached = await snapshotStore?.getFriendsLeaderboard();
  const requestedFriendIds = friendIds.slice(0, maxFriends);
  const cacheIncludesRecentPlaytime = cached?.data.every(
    (entry) => entry.totalPlaytimeMinutes === undefined || entry.recentPlaytimeMinutes !== undefined,
  );
  const cachedFriendIds = new Set(cached?.data.filter((entry) => !entry.isYou).map((entry) => entry.steamId));
  const cacheMatchesFriendList = cached !== undefined
    && requestedFriendIds.length === cachedFriendIds.size
    && requestedFriendIds.every((friendId) => cachedFriendIds.has(friendId))
    && cached.data.some((entry) => entry.isYou && entry.steamId === ownProfile.steamId);
  if (cached && cacheIncludesRecentPlaytime && cacheMatchesFriendList && !isExpired(cached.fetchedAt, ttlMs)) {
    return { status: 'available', entries: cached.data };
  }

  try {
    const ownAppIds = new Set((ownLibrary?.allGames ?? []).map((g) => g.appId));
    const summaryBySteamId = new Map(friendSummaries.map((s) => [s.steamid, s]));

    const friendEntries = await Promise.all(
      requestedFriendIds.map(async (friendId): Promise<SteamLeaderboardEntry> => {
        const summary = summaryBySteamId.get(friendId);
        const lib = await fetchFriendLibraryTotal(signal, apiKey, friendId);
        return {
          steamId: friendId,
          personaName: summary?.personaname ?? friendId,
          avatarUrl: summary?.avatarfull,
          totalPlaytimeMinutes: lib?.totalPlaytimeMinutes,
          recentPlaytimeMinutes: lib?.recentPlaytimeMinutes,
          sharedGames: lib ? [...lib.appIds].filter((appId) => ownAppIds.has(appId)).length : 0,
          isYou: false,
        };
      }),
    );

    const entries = [
      ...friendEntries,
      {
        steamId: ownProfile.steamId,
        personaName: ownProfile.personaName,
        avatarUrl: ownProfile.avatarUrl,
        totalPlaytimeMinutes: ownLibrary?.totalPlaytimeMinutes,
        recentPlaytimeMinutes: ownLibrary?.recentPlaytimeMinutes,
        sharedGames: ownAppIds.size,
        isYou: true,
      },
    ].sort((a, b) => (b.totalPlaytimeMinutes ?? -1) - (a.totalPlaytimeMinutes ?? -1));

    await snapshotStore?.setFriendsLeaderboard(entries);
    return { status: 'available', entries };
  } catch {
    if (cached) return { status: 'available', entries: cached.data };
    return { status: 'unavailable', entries: [] };
  }
}

async function getOrFetchAchievementSchema(
  signal: AbortSignal,
  apiKey: string,
  appId: number,
  snapshotStore: SteamSnapshotStore | undefined,
): Promise<SteamAchievementSchemaEntry[]> {
  const cached = await snapshotStore?.getAchievementSchema(appId);
  if (cached && !isExpired(cached.fetchedAt, ACHIEVEMENT_SCHEMA_TTL_MS)) return cached.data;

  try {
    const data = await steamRequest<{ game?: { availableGameStats?: { achievements?: RawSchemaAchievement[] } } }>(
      signal,
      apiKey,
      '/ISteamUserStats/GetSchemaForGame/v2/',
      { appid: String(appId) },
      'GetSchemaForGame',
    );
    const mapped: SteamAchievementSchemaEntry[] = (data.game?.availableGameStats?.achievements ?? []).map((a) => ({
      apiName: a.name,
      displayName: a.displayName,
      description: a.description,
      icon: a.icon,
    }));
    await snapshotStore?.setAchievementSchema(appId, mapped);
    return mapped;
  } catch {
    return cached?.data ?? [];
  }
}

async function getOrFetchAchievementPercentages(
  signal: AbortSignal,
  apiKey: string,
  appId: number,
  snapshotStore: SteamSnapshotStore | undefined,
): Promise<SteamAchievementPercentageEntry[]> {
  const cached = await snapshotStore?.getAchievementPercentages(appId);
  if (cached && !isExpired(cached.fetchedAt, ACHIEVEMENT_PERCENTAGES_TTL_MS)) return cached.data;

  try {
    const data = await steamRequest<{ achievementpercentages?: { achievements?: RawGlobalPercentage[] } }>(
      signal,
      apiKey,
      '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
      { gameid: String(appId) },
      'GetGlobalAchievementPercentagesForApp',
    );
    const mapped: SteamAchievementPercentageEntry[] = (data.achievementpercentages?.achievements ?? []).map((a) => ({
      apiName: a.name,
      percent: Number(a.percent),
    }));
    await snapshotStore?.setAchievementPercentages(appId, mapped);
    return mapped;
  } catch {
    return cached?.data ?? [];
  }
}

async function fetchAchievements(
  signal: AbortSignal,
  apiKey: string,
  steamId: string,
  appId: number,
  gameName: string,
  snapshotStore: SteamSnapshotStore | undefined,
): Promise<SteamData['achievements']> {
  let playerAchievements: RawPlayerAchievement[];
  try {
    const data = await steamRequest<{
      playerstats?: { success?: boolean; achievements?: RawPlayerAchievement[] };
    }>(
      signal,
      apiKey,
      '/ISteamUserStats/GetPlayerAchievements/v1/',
      { steamid: steamId, appid: String(appId) },
      'GetPlayerAchievements',
    );
    // Private profile or a game without stats both come back as `success: false` (sometimes HTTP 400,
    // caught above) rather than throwing — either way, achievements are simply unavailable here.
    if (!data.playerstats?.success || !data.playerstats.achievements) return null;
    playerAchievements = data.playerstats.achievements;
  } catch {
    return null;
  }
  if (playerAchievements.length === 0) return null;

  const schema = await getOrFetchAchievementSchema(signal, apiKey, appId, snapshotStore);
  const percentages = await getOrFetchAchievementPercentages(signal, apiKey, appId, snapshotStore);
  const { unlockedCount, totalCount, recentUnlocks, rarest, nextEasiest } = mergeAchievements(
    playerAchievements,
    schema,
    percentages,
  );
  return { appId, gameName, unlockedCount, totalCount, recentUnlocks, rarest, nextEasiest };
}

export interface SteamLeaderboardOptions {
  maxFriends: number;
  ttlMs: number;
}

const DEFAULT_LEADERBOARD_OPTIONS: SteamLeaderboardOptions = { maxFriends: 50, ttlMs: 12 * 60 * 60_000 };

export function createSteamProvider(
  auth: SteamAuth | undefined,
  snapshotStore?: SteamSnapshotStore,
  historyStore?: SteamHistoryStore,
  leaderboardOptions: SteamLeaderboardOptions = DEFAULT_LEADERBOARD_OPTIONS,
): Provider<SteamData> {
  return {
    id: 'steam',
    schema: steamSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 15_000,
    isConfigured: () => auth !== undefined,
    loadCached: () => snapshotStore?.getSnapshot() ?? Promise.resolve(undefined),
    async fetch(signal) {
      if (!auth) throw new Error('steam is not configured');
      const { apiKey, steamId } = auth;

      // Profile failure fails the whole provider — the scheduler retains the last-good snapshot as stale.
      const { profile, currentGame } = await fetchProfile(signal, apiKey, steamId);
      const recentlyPlayed = await fetchRecentlyPlayed(signal, apiKey, steamId);

      const cachedLibrary = await snapshotStore?.getLibraryCache();
      let library: SteamLibrarySnapshot | null = null;
      let libraryAvailability: SteamData['availability']['library'] = 'unavailable';

      if (cachedLibrary && !isExpired(cachedLibrary.fetchedAt, LIBRARY_CACHE_TTL_MS)) {
        library = cachedLibrary.data;
        libraryAvailability = 'available';
      } else {
        const result = await fetchOwnedGames(signal, apiKey, steamId);
        if (result.status === 'available') {
          library = result.data;
          libraryAvailability = 'available';
          await snapshotStore?.setLibraryCache(result.data);
        } else if (cachedLibrary) {
          // Prefer a stale-but-real cache over marking the whole library unavailable.
          library = cachedLibrary.data;
          libraryAvailability = 'available';
        } else {
          libraryAvailability = result.status;
        }
      }

      if (library) await historyStore?.record(library.totalPlaytimeMinutes);

      const tracked = pickTrackedGame(currentGame, recentlyPlayed, library?.mostPlayed);
      const achievements = tracked
        ? await fetchAchievements(signal, apiKey, steamId, tracked.appId, tracked.name, snapshotStore)
        : null;

      const friendIdsResult = await fetchFriendIds(signal, apiKey, steamId);
      let friendSummaries: RawPlayerSummary[] = [];
      let friendsAvailability: SteamData['availability']['friends'] = friendIdsResult.status;
      if (friendIdsResult.status === 'available') {
        try {
          friendSummaries = await fetchPlayerSummaries(signal, apiKey, friendIdsResult.friendIds);
          friendsAvailability = 'available';
        } catch {
          friendsAvailability = 'unavailable';
        }
      }

      const leaderboard =
        friendIdsResult.status === 'available'
          ? await getOrFetchFriendsLeaderboard(
              signal,
              apiKey,
              profile,
              library,
              friendIdsResult.friendIds,
              friendSummaries,
              leaderboardOptions.maxFriends,
              leaderboardOptions.ttlMs,
              snapshotStore,
            )
          : { status: 'unavailable' as const, entries: [] };

      const data: SteamData = {
        profile,
        currentGame,
        library,
        recentlyPlayed,
        achievements,
        friendsInGame: friendsAvailability === 'available' ? deriveFriendsInGame(friendSummaries) : [],
        playtimeHistory: (await historyStore?.get()) ?? [],
        friendsLeaderboard: leaderboard,
        availability: {
          library: libraryAvailability,
          achievements: achievements ? 'available' : 'unavailable',
          friends: friendsAvailability,
        },
      };

      const validated = steamSchema.parse(data);
      await snapshotStore?.setSnapshot(validated);
      return validated;
    },
  };
}
