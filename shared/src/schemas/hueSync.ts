import { z } from 'zod';

export const HUE_SYNC_STATES = ['off', 'starting', 'playing', 'paused', 'nothing-playing'] as const;

export const hueSyncDataSchema = z.object({
  /** Rooms (Hue group ids) whose lights currently follow Spotify. */
  roomIds: z.array(z.string()),
  state: z.enum(HUE_SYNC_STATES),
  /** The track the lights are showing, which can lead Spotify by a moment at a track change. */
  track: z
    .object({
      id: z.string(),
      name: z.string(),
      artist: z.string(),
      imageUrl: z.string().optional(),
    })
    .nullable(),
  /** The colors the lights are cycling through, as display hex swatches. */
  palette: z.array(z.string()),
  /** Sanitized reason the sync is struggling (e.g. `spotify-rate-limited`), or null. */
  problem: z.string().nullable(),
});

export type HueSyncState = (typeof HUE_SYNC_STATES)[number];
export type HueSyncData = z.infer<typeof hueSyncDataSchema>;
