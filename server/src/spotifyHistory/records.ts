import { z } from 'zod';

type ReleaseDatePrecision = 'year' | 'month' | 'day';
type AlbumType = 'album' | 'single' | 'compilation';

export const trackRecordSchema = z.object({
  id: z.string(),
  track: z.string(),
  artist: z.string(),
  artistIds: z.array(z.string()).default([]),
  album: z.string().optional(),
  albumId: z.string().optional(),
  releaseDate: z.string().optional(),
  durationMs: z.number().optional(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  playCount: z.number(),
  /** True only for tracks set via applyRealStreamCounts — everything else is a long_term-rank guess or a partial organic count, not a trustworthy absolute number. */
  verified: z.boolean().optional(),
});

/**
 * Metadata only — no playCount. Artist/album totals are *derived* at read time by summing their
 * own tracks' playCounts (see getAllTime), rather than maintained as a separately-incremented
 * number. Two independently-bookkept numbers (per-track and per-artist/album) drift apart the
 * moment any write path updates one without the other with perfect symmetry — which is exactly
 * what happened here across this store's iterative changes. Deriving from the single source of
 * truth (tracks) makes that whole bug class impossible.
 */
export const artistRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.string()).default([]),
});

export const albumRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: z.enum(['year', 'month', 'day']).optional(),
  totalTracks: z.number().optional(),
  /** Sum of every track's duration_ms from the full Spotify album — backfilled once via enrichAlbumDetails, since recentlyPlayed/top lists don't carry it. */
  totalDurationMs: z.number().optional(),
  /** Spotify's own classification — used to exclude compilations/greatest-hits from "top albums", since those aren't really an album you listened through. */
  albumType: z.enum(['album', 'single', 'compilation']).optional(),
});

export interface PlayedTrackInput {
  id: string;
  name: string;
  url?: string;
  durationMs?: number;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    /** Album-level credit, distinct from the artists on an individual track. */
    artist?: string;
    imageUrl?: string;
    url?: string;
    releaseDate?: string;
    releaseDatePrecision?: ReleaseDatePrecision;
    totalTracks?: number;
    albumType?: AlbumType;
  };
}

export interface AlbumDetailInput {
  id: string;
  totalDurationMs: number;
  totalTracks?: number;
  releaseDatePrecision?: ReleaseDatePrecision;
  albumType?: AlbumType;
  /** Every track on the album, per Spotify — used to backfill albumId/artistIds on our own track records. */
  tracks: { id: string; artistIds: string[] }[];
}

export interface SeedArtistInput {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
  genres: string[];
}

export interface ArtistMetadataInput {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
  genres: string[];
}

export type TrackRecord = z.infer<typeof trackRecordSchema>;
export type ArtistRecord = z.infer<typeof artistRecordSchema>;
export type AlbumRecord = z.infer<typeof albumRecordSchema>;

export interface ArtistLike {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
  genres?: string[];
}

export interface AlbumLike {
  id: string;
  name: string;
  artist: string;
  imageUrl?: string;
  url?: string;
  releaseDate?: string;
  releaseDatePrecision?: ReleaseDatePrecision;
  totalTracks?: number;
  albumType?: AlbumType;
}

/** A featured track must not replace the album's own credited artist. */
export function albumArtist(track: PlayedTrackInput): string {
  return track.album.artist || track.artists.map((artist) => artist.name).join(', ');
}

export const byPlayCountDesc = (a: { playCount: number }, b: { playCount: number }) => b.playCount - a.playCount;
