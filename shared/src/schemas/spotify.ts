import { z } from 'zod';

const trackSchema = z.object({
  id: z.string().optional(),
  track: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  /** Album release date as Spotify reports it: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
  releaseDate: z.string().optional(),
  durationMs: z.number().optional(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
});

const artistSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.string()).default([]),
});

const albumSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  artist: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  releaseDate: z.string().optional(),
  /** Whether releaseDate is a full day, a month, or only a year — Spotify reports this per-album. */
  releaseDatePrecision: z.enum(['year', 'month', 'day']).optional(),
  totalTracks: z.number().optional(),
  /** Sum of every track's duration on the album, from Spotify's full album object — undefined until backfilled. */
  totalDurationMs: z.number().optional(),
});

const albumTopTrackSchema = z.object({
  id: z.string().optional(),
  track: z.string(),
  playCount: z.number(),
  url: z.string().optional(),
});

/**
 * Play-count leaderboards accumulated locally over time — Spotify's API has no all-time or
 * top-albums endpoint, so these are built up on the server from observed plays (see
 * server/src/spotifyHistory.ts). Seeded once from Spotify's long_term top lists (weighted by
 * rank), then real observed plays accrue on top and eventually dominate the seed weight.
 */
const allTimeSchema = z.object({
  /** When tracking started (first long_term seed) — undefined until the first successful fetch. */
  trackedSince: z.string().optional(),
  artists: z.array(artistSchema.extend({ playCount: z.number() })),
  tracks: z.array(trackSchema.extend({ playCount: z.number() })),
  albums: z.array(
    albumSchema.extend({
      playCount: z.number(),
      /** Your most-played tracks from this album, up to 3. */
      topTracks: z.array(albumTopTrackSchema),
    }),
  ),
});

export const spotifySchema = z.object({
  /** Currently playing/paused track, or null when nothing is on. */
  nowPlaying: z
    .object({
      track: z.string(),
      artist: z.string(),
      album: z.string().optional(),
      releaseDate: z.string().optional(),
      imageUrl: z.string().optional(),
      url: z.string().optional(),
      isPlaying: z.boolean(),
      /** Position/length in ms, from the moment the server sampled — may lag between refreshes. */
      progressMs: z.number().nullable(),
      durationMs: z.number().nullable(),
    })
    .nullable(),
  recentlyPlayed: z.array(trackSchema.extend({ playedAt: z.string() })),
  /** short_term ≈ last 4 weeks, medium_term ≈ last 6 months (Spotify's windows). */
  topArtists: z.object({
    shortTerm: z.array(artistSchema),
    mediumTerm: z.array(artistSchema),
  }),
  topTracks: z.object({
    shortTerm: z.array(trackSchema),
    mediumTerm: z.array(trackSchema),
  }),
  allTime: allTimeSchema.default({ artists: [], tracks: [], albums: [] }),
});

export type SpotifyData = z.infer<typeof spotifySchema>;
