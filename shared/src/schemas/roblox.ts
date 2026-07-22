import { z } from 'zod';

export const robloxPresenceSchema = z.object({
  status: z.enum(['online', 'in-game', 'in-studio', 'offline']),
  gameName: z.string().optional(),
  lastOnline: z.string().optional(),
  /** rootPlaceId from the presence lookup — links out to the game's page on roblox.com. */
  placeId: z.number().optional(),
  /** Square game icon (150x150) — used for compact tile-style rendering. */
  iconUrl: z.string().optional(),
  /** Wide game thumbnail (768x432) — used for larger hero/secondary-style rendering. */
  thumbnailUrl: z.string().optional(),
  /** Concurrent players in this game right now, from Roblox's public games API. */
  playing: z.number().optional(),
  /** All-time visit count for this game, from Roblox's public games API. */
  visits: z.number().optional(),
});

export type RobloxPresence = z.infer<typeof robloxPresenceSchema>;

export const robloxSchema = z.object({
  /** null when no session cookie is configured, or the cookie has expired/is invalid. */
  presence: robloxPresenceSchema.nullable(),
  /** 'unauthorized' distinguishes an expired/invalid cookie from a generic fetch failure. */
  availability: z.enum(['available', 'unavailable', 'unauthorized']),
});

export type RobloxData = z.infer<typeof robloxSchema>;
