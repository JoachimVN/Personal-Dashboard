import { describe, expect, it, vi } from 'vitest';
import {
  chunkFriendIds,
  createSteamProvider,
  mapGame,
  mergeAchievements,
  pickTrackedGame,
  steamHeaderUrl,
  steamIconUrl,
  unixSecondsToIso,
} from './steam.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function emptySnapshotStore() {
  return {
    getSnapshot: vi.fn().mockResolvedValue(undefined),
    setSnapshot: vi.fn().mockResolvedValue(undefined),
    getLibraryCache: vi.fn().mockResolvedValue(undefined),
    setLibraryCache: vi.fn().mockResolvedValue(undefined),
    getAchievementSchema: vi.fn().mockResolvedValue(undefined),
    setAchievementSchema: vi.fn().mockResolvedValue(undefined),
    getAchievementPercentages: vi.fn().mockResolvedValue(undefined),
    setAchievementPercentages: vi.fn().mockResolvedValue(undefined),
    getFriendsLeaderboard: vi.fn().mockResolvedValue(undefined),
    setFriendsLeaderboard: vi.fn().mockResolvedValue(undefined),
  };
}

describe('image URL derivation and timestamp conversion', () => {
  it('derives an icon URL from the app ID and icon hash', () => {
    expect(steamIconUrl(400, 'abc123')).toBe(
      'https://media.steampowered.com/steamcommunity/public/images/apps/400/abc123.jpg',
    );
  });

  it('has no icon URL when Steam reports no icon hash', () => {
    expect(steamIconUrl(400, undefined)).toBeUndefined();
  });

  it('derives a header URL from just the app ID', () => {
    expect(steamHeaderUrl(400)).toBe('https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg');
  });

  it('converts Steam unlocktime Unix seconds to an ISO string', () => {
    expect(unixSecondsToIso(1_752_600_000)).toBe(new Date(1_752_600_000 * 1000).toISOString());
  });
});

describe('mapGame', () => {
  it('normalizes a raw Steam game entry, deriving both image URLs', () => {
    expect(
      mapGame({ appid: 400, name: 'Portal', playtime_forever: 120, playtime_2weeks: 30, img_icon_url: 'hash1' }),
    ).toEqual({
      appId: 400,
      name: 'Portal',
      iconUrl: 'https://media.steampowered.com/steamcommunity/public/images/apps/400/hash1.jpg',
      headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg',
      playtimeForeverMinutes: 120,
      playtimeRecentMinutes: 30,
    });
  });
});

describe('pickTrackedGame', () => {
  const recentlyPlayed = [mapGame({ appid: 20, name: 'Team Fortress 2', playtime_forever: 500 })];

  it('prefers the current game over recently played', () => {
    const currentGame = mapGame({ appid: 10, name: 'Half-Life', playtime_forever: 60 });
    expect(pickTrackedGame(currentGame, recentlyPlayed)).toEqual({ appId: 10, name: 'Half-Life' });
  });

  it('falls back to the first recently-played game when nothing is currently running', () => {
    expect(pickTrackedGame(null, recentlyPlayed)).toEqual({ appId: 20, name: 'Team Fortress 2' });
  });

  it('falls back to the most-played library game when nothing is current or recent', () => {
    const mostPlayed = [mapGame({ appid: 30, name: 'Counter-Strike', playtime_forever: 50_000 })];
    expect(pickTrackedGame(null, [], mostPlayed)).toEqual({ appId: 30, name: 'Counter-Strike' });
  });

  it('is undefined when there is no current, recent, or library history at all', () => {
    expect(pickTrackedGame(null, [])).toBeUndefined();
  });
});

describe('mergeAchievements', () => {
  it('merges only unlocked achievements with schema display data and global rarity', () => {
    const result = mergeAchievements(
      [
        { apiname: 'ACH_WIN', achieved: 1, unlocktime: 1_752_600_000 },
        { apiname: 'ACH_LOSE', achieved: 0, unlocktime: 0 },
      ],
      [{ apiName: 'ACH_WIN', displayName: 'Winner', description: 'Win a match', icon: 'https://icon' }],
      [{ apiName: 'ACH_WIN', percent: 4.2 }],
    );
    expect(result.unlockedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.recentUnlocks).toEqual([
      {
        apiName: 'ACH_WIN',
        displayName: 'Winner',
        description: 'Win a match',
        iconUrl: 'https://icon',
        unlockedAt: unixSecondsToIso(1_752_600_000),
        globalUnlockedPercent: 4.2,
      },
    ]);
  });

  it('falls back to the raw API name when no schema entry matches', () => {
    const result = mergeAchievements([{ apiname: 'ACH_MYSTERY', achieved: 1, unlocktime: 1_752_600_000 }], [], []);
    expect(result.recentUnlocks[0]).toMatchObject({ apiName: 'ACH_MYSTERY', displayName: 'ACH_MYSTERY', globalUnlockedPercent: undefined });
  });

  it('ranks unlocked achievements by ascending global rarity, dropping ones with no rarity data', () => {
    const result = mergeAchievements(
      [
        { apiname: 'ACH_COMMON', achieved: 1, unlocktime: 1 },
        { apiname: 'ACH_RARE', achieved: 1, unlocktime: 2 },
        { apiname: 'ACH_UNKNOWN', achieved: 1, unlocktime: 3 },
      ],
      [],
      [
        { apiName: 'ACH_COMMON', percent: 80 },
        { apiName: 'ACH_RARE', percent: 1.5 },
      ],
    );
    expect(result.rarest.map((a) => a.apiName)).toEqual(['ACH_RARE', 'ACH_COMMON']);
  });

  it('surfaces locked achievements with the highest global unlock rate as "next easiest"', () => {
    const result = mergeAchievements(
      [
        { apiname: 'ACH_DONE', achieved: 1, unlocktime: 1 },
        { apiname: 'ACH_HARD', achieved: 0, unlocktime: 0 },
        { apiname: 'ACH_EASY', achieved: 0, unlocktime: 0 },
        { apiname: 'ACH_UNKNOWN', achieved: 0, unlocktime: 0 },
      ],
      [
        { apiName: 'ACH_DONE', displayName: 'Done' },
        { apiName: 'ACH_HARD', displayName: 'Hard' },
        { apiName: 'ACH_EASY', displayName: 'Easy' },
        { apiName: 'ACH_UNKNOWN', displayName: 'Unknown' },
      ],
      [
        { apiName: 'ACH_HARD', percent: 2 },
        { apiName: 'ACH_EASY', percent: 95 },
      ],
    );
    // Already-unlocked (ACH_DONE) and rarity-less (ACH_UNKNOWN) achievements never appear here.
    expect(result.nextEasiest.map((a) => a.apiName)).toEqual(['ACH_EASY', 'ACH_HARD']);
  });
});

describe('chunkFriendIds', () => {
  it('splits friend IDs into chunks of at most the given size', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const chunks = chunkFriendIds(ids, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });

  it('returns a single chunk when under the limit', () => {
    expect(chunkFriendIds(['a', 'b'], 100)).toEqual([['a', 'b']]);
  });
});

describe('createSteamProvider fetch', () => {
  const auth = { apiKey: 'test-key', steamId: '76561198000000000' };

  it('degrades library and friends to private, and marks achievements unavailable for a locked-down profile', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      // GetPlayerSummaries (own profile) — not currently playing
      .mockResolvedValueOnce(jsonResponse({
        response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex', avatarfull: 'https://avatar/alex.jpg' }] },
      }))
      // GetRecentlyPlayedGames
      .mockResolvedValueOnce(jsonResponse({
        response: { games: [{ appid: 400, name: 'Portal', playtime_forever: 120, playtime_2weeks: 30, img_icon_url: 'hash1' }] },
      }))
      // GetOwnedGames — private Game Details returns an empty response object
      .mockResolvedValueOnce(jsonResponse({ response: {} }))
      // GetPlayerAchievements — private profile
      .mockResolvedValueOnce(jsonResponse({ playerstats: { success: false, error: 'Profile is not public' } }))
      // GetFriendList — private friends list
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    try {
      const provider = createSteamProvider(auth, emptySnapshotStore() as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.currentGame).toBeNull();
      expect(data.library).toBeNull();
      expect(data.availability.library).toBe('private');
      expect(data.achievements).toBeNull();
      expect(data.availability.achievements).toBe('unavailable');
      expect(data.friendsInGame).toEqual([]);
      expect(data.availability.friends).toBe('private');
      expect(data.recentlyPlayed[0]).toMatchObject({ appId: 400, name: 'Portal' });
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('tracks the most-played library game for achievements when nothing is current or within the last 2 weeks', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      // GetPlayerSummaries (own profile) — not currently playing
      .mockResolvedValueOnce(jsonResponse({
        response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex' }] },
      }))
      // GetRecentlyPlayedGames — nothing played in the last 2 weeks
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      // GetOwnedGames — a big real library, but no recent playtime
      .mockResolvedValueOnce(jsonResponse({
        response: {
          game_count: 72,
          games: [
            { appid: 10, name: 'Counter-Strike', playtime_forever: 50_000, playtime_2weeks: 0 },
            { appid: 20, name: 'Team Fortress 2', playtime_forever: 500, playtime_2weeks: 0 },
          ],
        },
      }))
      // GetPlayerAchievements — for the most-played game (Counter-Strike, appid 10)
      .mockResolvedValueOnce(jsonResponse({ playerstats: { success: true, achievements: [{ apiname: 'ACH_1', achieved: 1, unlocktime: 1_752_600_000 }] } }))
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [] } }));

    try {
      const provider = createSteamProvider(auth, emptySnapshotStore() as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.currentGame).toBeNull();
      expect(data.recentlyPlayed).toEqual([]);
      expect(data.library).toMatchObject({ totalGames: 72 });
      expect(data.achievements).toMatchObject({ appId: 10, gameName: 'Counter-Strike', unlockedCount: 1 });
      expect(data.availability.achievements).toBe('available');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('falls back to the raw achievement name when the schema/rarity requests fail, but still reports unlock counts', async () => {
    const snapshotStore = emptySnapshotStore();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex', gameid: '10', gameextrainfo: 'Half-Life' }] },
      }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      .mockResolvedValueOnce(jsonResponse({ response: {} }))
      .mockResolvedValueOnce(jsonResponse({
        playerstats: { success: true, achievements: [
          { apiname: 'ACH_1', achieved: 1, unlocktime: 1_752_600_000 },
          { apiname: 'ACH_2', achieved: 0, unlocktime: 0 },
        ] },
      }))
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [] } }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.availability.achievements).toBe('available');
      expect(data.achievements).toMatchObject({ appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 2 });
      expect(data.achievements?.recentUnlocks[0]).toMatchObject({ apiName: 'ACH_1', displayName: 'ACH_1', globalUnlockedPercent: undefined });
      expect(snapshotStore.setAchievementSchema).not.toHaveBeenCalled();
      expect(snapshotStore.setAchievementPercentages).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reuses a fresh cached library without re-fetching it', async () => {
    const cachedLibrary = { totalGames: 5, totalPlaytimeMinutes: 600, recentPlaytimeMinutes: 60, mostPlayed: [], allGames: [] };
    const snapshotStore = emptySnapshotStore();
    snapshotStore.getLibraryCache.mockResolvedValue({ data: cachedLibrary, fetchedAt: new Date() });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex' }] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [] } }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.library).toEqual(cachedLibrary);
      expect(data.availability.library).toBe('available');
      expect(snapshotStore.setLibraryCache).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('refreshes an expired cached library and stores the new result', async () => {
    const staleLibrary = { totalGames: 1, totalPlaytimeMinutes: 10, recentPlaytimeMinutes: 0, mostPlayed: [] };
    const snapshotStore = emptySnapshotStore();
    snapshotStore.getLibraryCache.mockResolvedValue({ data: staleLibrary, fetchedAt: new Date(Date.now() - 7 * 60 * 60_000) });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex' }] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      .mockResolvedValueOnce(jsonResponse({
        response: { game_count: 2, games: [{ appid: 1, name: 'A', playtime_forever: 100 }, { appid: 2, name: 'B', playtime_forever: 50 }] },
      }))
      // GetPlayerAchievements — now reachable, since the freshly-fetched library's most-played
      // game (A) becomes the tracked game when nothing is current or recent.
      .mockResolvedValueOnce(jsonResponse({ playerstats: { success: false, error: 'no stats for this game' } }))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [] } }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.library).toMatchObject({ totalGames: 2, totalPlaytimeMinutes: 150 });
      expect(snapshotStore.setLibraryCache).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reuses fresh cached achievement schema and rarity without re-fetching them', async () => {
    const snapshotStore = emptySnapshotStore();
    snapshotStore.getAchievementSchema.mockResolvedValue({
      data: [{ apiName: 'ACH_1', displayName: 'Freeman', description: 'Do the thing', icon: 'https://icon' }],
      fetchedAt: new Date(),
    });
    snapshotStore.getAchievementPercentages.mockResolvedValue({
      data: [{ apiName: 'ACH_1', percent: 12.5 }],
      fetchedAt: new Date(),
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex', gameid: '10', gameextrainfo: 'Half-Life' }] },
      }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      .mockResolvedValueOnce(jsonResponse({ response: {} }))
      .mockResolvedValueOnce(jsonResponse({ playerstats: { success: true, achievements: [{ apiname: 'ACH_1', achieved: 1, unlocktime: 1_752_600_000 }] } }))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [] } }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.achievements?.recentUnlocks[0]).toMatchObject({ displayName: 'Freeman', globalUnlockedPercent: 12.5 });
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('computes a friends playtime leaderboard, keeping private-library friends unranked rather than dropping them', async () => {
    const snapshotStore = emptySnapshotStore();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex' }] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      // GetOwnedGames (own) — appids 10 and 20
      .mockResolvedValueOnce(jsonResponse({
        response: { game_count: 2, games: [{ appid: 10, name: 'A', playtime_forever: 100, playtime_2weeks: 20 }, { appid: 20, name: 'B', playtime_forever: 50, playtime_2weeks: 10 }] },
      }))
      // GetPlayerAchievements — tracked game (A) has no stats
      .mockResolvedValueOnce(jsonResponse({ playerstats: { success: false, error: 'no stats' } }))
      // GetFriendList
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [{ steamid: 'friend1' }, { steamid: 'friend2' }] } }))
      // GetPlayerSummaries (friends)
      .mockResolvedValueOnce(jsonResponse({
        response: { players: [{ steamid: 'friend1', personaname: 'Bob', avatarfull: 'https://avatar/bob.jpg' }, { steamid: 'friend2', personaname: 'Cara' }] },
      }))
      // GetOwnedGames (friend1) — shares appid 10 with the user
      .mockResolvedValueOnce(jsonResponse({
        response: { games: [{ appid: 10, playtime_forever: 80, playtime_2weeks: 7 }, { appid: 99, playtime_forever: 20, playtime_2weeks: 1 }] },
      }))
      // GetOwnedGames (friend2) — private
      .mockResolvedValueOnce(jsonResponse({ response: {} }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.friendsLeaderboard.status).toBe('available');
      expect(data.friendsLeaderboard.entries).toEqual([
        { steamId: auth.steamId, personaName: 'Alex', avatarUrl: undefined, totalPlaytimeMinutes: 150, recentPlaytimeMinutes: 30, sharedGames: 2, isYou: true },
        { steamId: 'friend1', personaName: 'Bob', avatarUrl: 'https://avatar/bob.jpg', totalPlaytimeMinutes: 100, recentPlaytimeMinutes: 8, sharedGames: 1, isYou: false },
        { steamId: 'friend2', personaName: 'Cara', avatarUrl: undefined, totalPlaytimeMinutes: undefined, sharedGames: 0, isYou: false },
      ]);
      expect(snapshotStore.setFriendsLeaderboard).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(8);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reuses a fresh cached leaderboard without re-fetching every friend\'s library', async () => {
    const cachedLeaderboard = [
      { steamId: auth.steamId, personaName: 'Alex', totalPlaytimeMinutes: 150, recentPlaytimeMinutes: 0, sharedGames: 2, isYou: true },
      { steamId: 'friend1', personaName: 'Bob', totalPlaytimeMinutes: 100, recentPlaytimeMinutes: 0, sharedGames: 1, isYou: false },
    ];
    const snapshotStore = emptySnapshotStore();
    snapshotStore.getFriendsLeaderboard.mockResolvedValue({ data: cachedLeaderboard, fetchedAt: new Date() });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ response: { players: [{ steamid: auth.steamId, personaname: 'Alex', profileurl: 'https://steamcommunity.com/id/alex' }] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { games: [] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { game_count: 0, games: [] } }))
      .mockResolvedValueOnce(jsonResponse({ friendslist: { friends: [{ steamid: 'friend1' }] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { players: [{ steamid: 'friend1', personaname: 'Bob' }] } }));

    try {
      const provider = createSteamProvider(auth, snapshotStore as never);
      const data = await provider.fetch(new AbortController().signal, false);

      expect(data.friendsLeaderboard).toEqual({ status: 'available', entries: cachedLeaderboard });
      expect(snapshotStore.setFriendsLeaderboard).not.toHaveBeenCalled();
      // No per-friend GetOwnedGames calls beyond the 5 already queued above.
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
