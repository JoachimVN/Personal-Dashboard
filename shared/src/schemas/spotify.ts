import { z } from 'zod';

const trackSchema = z.object({
  track: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  /** Album release date as Spotify reports it: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
  releaseDate: z.string().optional(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
});

const artistSchema = z.object({
  name: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.string()).default([]),
});

export const spotifySchema = z.object({
  /** Currently playing/paused track, or null when nothing is on. */
  nowPlaying: z
    .object({
      track: z.string(),
      artist: z.string(),
      album: z.string().optional(),
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
});

export type SpotifyData = z.infer<typeof spotifySchema>;
