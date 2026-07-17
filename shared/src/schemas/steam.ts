import { z } from 'zod';

export const steamGameSchema = z.object({
  appId: z.number(),
  name: z.string(),
  /** Derived from appid + img_icon_url; Steam's game-library responses only return the hash. */
  iconUrl: z.string().optional(),
  /** Derived from appid; Steam does not return a finished header image URL either. */
  headerUrl: z.string().optional(),
  playtimeForeverMinutes: z.number().optional(),
  /** Minutes played in Steam's own trailing "recent" window (currently ~2 weeks). */
  playtimeRecentMinutes: z.number().optional(),
});

export type SteamGame = z.infer<typeof steamGameSchema>;

export const steamAchievementSchema = z.object({
  apiName: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  /** Converted from Steam's unlocktime Unix-seconds field. */
  unlockedAt: z.string(),
  /** Share of all players who have unlocked this achievement, from GetGlobalAchievementPercentagesForApp. */
  globalUnlockedPercent: z.number().optional(),
});

export type SteamAchievement = z.infer<typeof steamAchievementSchema>;

/** A not-yet-unlocked achievement — no `unlockedAt`, used for the "closest to unlocking" showcase. */
export const steamLockedAchievementSchema = z.object({
  apiName: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  globalUnlockedPercent: z.number().optional(),
});

export type SteamLockedAchievement = z.infer<typeof steamLockedAchievementSchema>;

export const steamLeaderboardEntrySchema = z.object({
  steamId: z.string(),
  personaName: z.string(),
  avatarUrl: z.string().optional(),
  /** undefined means this friend's library is private — still shown, just unranked. */
  totalPlaytimeMinutes: z.number().optional(),
  /** Count of appIds this friend's library shares with your own. */
  sharedGames: z.number(),
  isYou: z.boolean(),
});

export type SteamLeaderboardEntry = z.infer<typeof steamLeaderboardEntrySchema>;

export const steamPlaytimeHistoryPointSchema = z.object({
  date: z.string(),
  totalPlaytimeMinutes: z.number(),
});

export type SteamPlaytimeHistoryPoint = z.infer<typeof steamPlaytimeHistoryPointSchema>;

export const steamFriendSchema = z.object({
  steamId: z.string(),
  personaName: z.string(),
  avatarUrl: z.string().optional(),
  appId: z.number().optional(),
  /** Falls back to "Playing a Steam game" when Steam only reports a gameid, no game name. */
  gameName: z.string(),
});

export type SteamFriend = z.infer<typeof steamFriendSchema>;

export const steamSchema = z.object({
  profile: z.object({
    /** Kept as a string — 64-bit SteamIDs lose precision as JS numbers. */
    steamId: z.string(),
    personaName: z.string(),
    avatarUrl: z.string().optional(),
    profileUrl: z.string(),
  }),
  currentGame: steamGameSchema.nullable(),
  /** null means library data is inaccessible (private/unavailable) — distinct from a genuine empty library. */
  library: z
    .object({
      totalGames: z.number(),
      totalPlaytimeMinutes: z.number(),
      recentPlaytimeMinutes: z.number(),
      mostPlayed: z.array(steamGameSchema),
      /** Every owned game with its all-time and last-2-weeks playtime — the only two windows
       * Steam's API actually tracks; there is no native "last N months" breakdown. */
      allGames: z.array(steamGameSchema),
    })
    .nullable(),
  recentlyPlayed: z.array(steamGameSchema),
  /** The "tracked game" for achievement progress: current game if playing, else the most recent one. */
  achievements: z
    .object({
      appId: z.number(),
      gameName: z.string(),
      unlockedCount: z.number(),
      totalCount: z.number(),
      recentUnlocks: z.array(steamAchievementSchema),
      /** Up to 5 unlocked achievements with the lowest global unlock percent. */
      rarest: z.array(steamAchievementSchema),
      /** Up to 5 locked achievements with the highest global unlock percent — "most players have
       * this, you don't yet". */
      nextEasiest: z.array(steamLockedAchievementSchema),
    })
    .nullable(),
  friendsInGame: z.array(steamFriendSchema),
  /** One row per calendar day of cumulative all-time playtime, oldest first. Client derives
   * day-over-day deltas for the trend chart. */
  playtimeHistory: z.array(steamPlaytimeHistoryPointSchema),
  friendsLeaderboard: z.object({
    status: z.enum(['available', 'unavailable']),
    entries: z.array(steamLeaderboardEntrySchema),
  }),
  availability: z.object({
    library: z.enum(['available', 'private', 'unavailable']),
    achievements: z.enum(['available', 'unavailable']),
    friends: z.enum(['available', 'private', 'unavailable']),
  }),
});

export type SteamData = z.infer<typeof steamSchema>;
