import { z } from 'zod';

export const robloxBadgeSchema = z.object({
  id: z.number(),
  name: z.string(),
  iconUrl: z.string().optional(),
  /** Comes from a separate awarded-dates lookup — absent if that best-effort call fails. */
  awardedAt: z.string().optional(),
});

export type RobloxBadge = z.infer<typeof robloxBadgeSchema>;

export const robloxGameSchema = z.object({
  id: z.number(),
  name: z.string(),
  iconUrl: z.string().optional(),
  visits: z.number().optional(),
  relation: z.enum(['created', 'favorite']),
});

export type RobloxGame = z.infer<typeof robloxGameSchema>;

export const robloxPresenceSchema = z.object({
  status: z.enum(['online', 'in-game', 'in-studio', 'offline']),
  gameName: z.string().optional(),
  lastOnline: z.string().optional(),
});

export type RobloxPresence = z.infer<typeof robloxPresenceSchema>;

export const robloxSchema = z.object({
  profile: z.object({
    userId: z.number(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
  }),
  /** null when no session cookie is configured, or the cookie has expired/is invalid. */
  presence: robloxPresenceSchema.nullable(),
  friendsCount: z.number(),
  recentBadges: z.array(robloxBadgeSchema),
  /** Created (public) and favorited (requires the session cookie) games, most-recent first. */
  games: z.array(robloxGameSchema),
  availability: z.object({
    /** 'unauthorized' distinguishes an expired/invalid cookie (or a cookie-gated endpoint with no
     * cookie configured) from a generic fetch failure. */
    presence: z.enum(['available', 'unavailable', 'unauthorized']),
    /** Roblox has been gradually gating legacy endpoints like this one behind auth — degrades
     * independently rather than taking the whole provider down when it happens. */
    badges: z.enum(['available', 'unavailable', 'unauthorized']),
    createdGames: z.enum(['available', 'unavailable', 'unauthorized']),
    favoriteGames: z.enum(['available', 'unavailable', 'unauthorized']),
  }),
});

export type RobloxData = z.infer<typeof robloxSchema>;
