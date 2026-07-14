import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const TOP_LIMIT = 100;
/** An album only counts as "listened to" once we've tracked at least this many distinct songs from it — otherwise a single popular track from a 20-track album would rank alongside albums played all the way through. */
const MIN_TRACKED_TRACKS_PER_ALBUM = 3;

const trackRecordSchema = z.object({
  id: z.string(),
  track: z.string(),
  artist: z.string(),
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

const artistRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.string()).default([]),
  playCount: z.number(),
});

const albumRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: z.enum(['year', 'month', 'day']).optional(),
  totalTracks: z.number().optional(),
  /** Sum of every track's duration_ms from the full Spotify album — backfilled once via enrichAlbumDurations, since recentlyPlayed/top lists don't carry it. */
  totalDurationMs: z.number().optional(),
  playCount: z.number(),
});

const fileSchema = z.object({
  version: z.literal(1),
  seededAt: z.string().optional(),
  lastPlayedAt: z.string().optional(),
  tracks: z.record(z.string(), trackRecordSchema).default({}),
  artists: z.record(z.string(), artistRecordSchema).default({}),
  albums: z.record(z.string(), albumRecordSchema).default({}),
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
    imageUrl?: string;
    url?: string;
    releaseDate?: string;
    releaseDatePrecision?: 'year' | 'month' | 'day';
    totalTracks?: number;
  };
}

export interface AlbumDetailInput {
  id: string;
  totalDurationMs: number;
  totalTracks?: number;
  releaseDatePrecision?: 'year' | 'month' | 'day';
  /** Ids of every track on the album, per Spotify — used to backfill albumId on our own track records. */
  trackIds: string[];
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

type TrackRecord = z.infer<typeof trackRecordSchema>;
type ArtistRecord = z.infer<typeof artistRecordSchema>;
type AlbumRecord = z.infer<typeof albumRecordSchema>;

const byPlayCountDesc = (a: { playCount: number }, b: { playCount: number }) => b.playCount - a.playCount;

/**
 * Accumulates real Spotify play counts (from recentlyPlayed, deduped by played_at) into an
 * "all-time" leaderboard the API itself never exposes — Spotify has no top-albums endpoint and no
 * permanent history, only rolling short/medium/long_term windows. Seeded once from the long_term
 * top lists (weighted by rank) so the view isn't empty on day one; real observed plays then accrue
 * on top and eventually overtake the seed weight. Persisted to disk (same pattern as
 * spotifyCache.ts) so history survives server restarts.
 */
export class SpotifyHistoryStore {
  private seededAt: string | undefined;
  private lastPlayedAt: string | undefined;
  private tracks: Record<string, TrackRecord>;
  private artists: Record<string, ArtistRecord>;
  private albums: Record<string, AlbumRecord>;

  constructor(private readonly filePath: string) {
    const loaded = this.load();
    this.seededAt = loaded.seededAt;
    this.lastPlayedAt = loaded.lastPlayedAt;
    this.tracks = loaded.tracks;
    this.artists = loaded.artists;
    this.albums = loaded.albums;
  }

  isSeeded(): boolean {
    return this.seededAt !== undefined;
  }

  /** One-time backfill from Spotify's long_term top lists. No-ops if already seeded. */
  seedIfNeeded(input: { artists: SeedArtistInput[]; tracks: PlayedTrackInput[] }): void {
    if (this.isSeeded()) return;

    input.artists.forEach((artist, i) => {
      this.artists[artist.id] = { ...artist, playCount: input.artists.length - i };
    });

    input.tracks.forEach((track, i) => {
      const weight = input.tracks.length - i;
      this.tracks[track.id] = {
        id: track.id,
        track: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: weight,
      };
      const existingAlbum = this.albums[track.album.id];
      this.albums[track.album.id] = {
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision,
        totalTracks: track.album.totalTracks,
        totalDurationMs: existingAlbum?.totalDurationMs,
        playCount: (existingAlbum?.playCount ?? 0) + weight,
      };
    });

    this.seededAt = new Date().toISOString();
    this.save();
  }

  /** Records newly-observed plays (played_at newer than the last one processed) from a recentlyPlayed page. */
  recordPlays(entries: { playedAt: string; track: PlayedTrackInput }[]): void {
    const cutoff = this.lastPlayedAt ? Date.parse(this.lastPlayedAt) : -Infinity;
    const fresh = entries
      .filter((e) => Date.parse(e.playedAt) > cutoff)
      .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
    if (fresh.length === 0) return;

    for (const { playedAt, track } of fresh) {
      const existingTrack = this.tracks[track.id];
      this.tracks[track.id] = {
        id: track.id,
        track: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: (existingTrack?.playCount ?? 0) + 1,
        verified: existingTrack?.verified,
      };

      for (const artist of track.artists) {
        const existingArtist = this.artists[artist.id];
        this.artists[artist.id] = {
          id: artist.id,
          name: artist.name,
          imageUrl: existingArtist?.imageUrl,
          url: existingArtist?.url,
          genres: existingArtist?.genres ?? [],
          playCount: (existingArtist?.playCount ?? 0) + 1,
        };
      }

      const existingAlbum = this.albums[track.album.id];
      this.albums[track.album.id] = {
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision ?? existingAlbum?.releaseDatePrecision,
        totalTracks: track.album.totalTracks ?? existingAlbum?.totalTracks,
        totalDurationMs: existingAlbum?.totalDurationMs,
        playCount: (existingAlbum?.playCount ?? 0) + 1,
      };

      this.lastPlayedAt = playedAt;
    }
    this.save();
  }

  /**
   * Overwrites specific tracks' playCount with real, externally-known stream counts (e.g. from a
   * personally-tracked playlist), rather than the +1-per-observed-play accumulation the rest of
   * this store does. Artist/album totals are adjusted by the delta versus the previous count
   * rather than re-summed outright, so other tracks contributing to the same artist/album aren't
   * touched. Safe to re-run with updated numbers — it's a set, not an increment.
   */
  applyRealStreamCounts(entries: { track: PlayedTrackInput; streams: number }[]): void {
    for (const { track, streams } of entries) {
      const existingTrack = this.tracks[track.id];
      const delta = streams - (existingTrack?.playCount ?? 0);

      this.tracks[track.id] = {
        id: track.id,
        track: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: streams,
        verified: true,
      };

      for (const artist of track.artists) {
        const existingArtist = this.artists[artist.id];
        this.artists[artist.id] = {
          id: artist.id,
          name: artist.name,
          imageUrl: existingArtist?.imageUrl,
          url: existingArtist?.url,
          genres: existingArtist?.genres ?? [],
          playCount: (existingArtist?.playCount ?? 0) + delta,
        };
      }

      const existingAlbum = this.albums[track.album.id];
      this.albums[track.album.id] = {
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision ?? existingAlbum?.releaseDatePrecision,
        totalTracks: track.album.totalTracks ?? existingAlbum?.totalTracks,
        totalDurationMs: existingAlbum?.totalDurationMs,
        playCount: (existingAlbum?.playCount ?? 0) + delta,
      };
    }
    this.save();
  }

  /** Backfills image/url/genres for accumulated artists once they show up in a top-artists fetch — recentlyPlayed alone never carries artist images. */
  mergeArtistMetadata(metadata: ArtistMetadataInput[]): void {
    let changed = false;
    for (const meta of metadata) {
      const existing = this.artists[meta.id];
      if (!existing) continue;
      const imageUrl = existing.imageUrl ?? meta.imageUrl;
      const url = existing.url ?? meta.url;
      const genres = existing.genres.length > 0 ? existing.genres : meta.genres;
      if (imageUrl !== existing.imageUrl || url !== existing.url || genres !== existing.genres) {
        this.artists[meta.id] = { ...existing, imageUrl, url, genres };
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** Album ids missing duration or track count — one fetch per id (see providers/spotify.ts). Gated on both fields so an album enriched before totalTracks existed still gets revisited once. */
  getAlbumIdsNeedingDurations(limit: number): string[] {
    return Object.values(this.albums)
      .filter((album) => album.totalDurationMs === undefined || album.totalTracks === undefined)
      .slice(0, limit)
      .map((album) => album.id);
  }

  /**
   * Applies a fetched album's authoritative metadata, and — since the same response carries the
   * album's full tracklist — self-heals `albumId` on any of our own track records that predate
   * that field (or otherwise drifted), so per-album top tracks stay correct without waiting for
   * those tracks to be replayed.
   */
  enrichAlbumDetails(details: AlbumDetailInput[]): void {
    let changed = false;
    for (const detail of details) {
      const existing = this.albums[detail.id];
      if (existing) {
        this.albums[detail.id] = {
          ...existing,
          totalDurationMs: detail.totalDurationMs,
          totalTracks: detail.totalTracks ?? existing.totalTracks,
          releaseDatePrecision: detail.releaseDatePrecision ?? existing.releaseDatePrecision,
        };
        changed = true;
      }
      for (const trackId of detail.trackIds) {
        const track = this.tracks[trackId];
        if (track && track.albumId !== detail.id) {
          this.tracks[trackId] = { ...track, albumId: detail.id };
          changed = true;
        }
      }
    }
    if (changed) this.save();
  }

  getAllTime(
    limit = TOP_LIMIT,
    minTrackedTracksPerAlbum = MIN_TRACKED_TRACKS_PER_ALBUM,
  ): {
    trackedSince: string | undefined;
    artists: ArtistRecord[];
    tracks: TrackRecord[];
    albums: (AlbumRecord & { topTracks: { id: string; track: string; playCount: number; url?: string }[] })[];
  } {
    const allTracks = Object.values(this.tracks);
    const trackedTrackCountByAlbum = new Map<string, number>();
    for (const track of allTracks) {
      if (!track.albumId) continue;
      trackedTrackCountByAlbum.set(track.albumId, (trackedTrackCountByAlbum.get(track.albumId) ?? 0) + 1);
    }

    return {
      trackedSince: this.seededAt,
      artists: Object.values(this.artists).sort(byPlayCountDesc).slice(0, limit),
      tracks: allTracks.sort(byPlayCountDesc).slice(0, limit),
      albums: Object.values(this.albums)
        .filter((album) => (trackedTrackCountByAlbum.get(album.id) ?? 0) >= minTrackedTracksPerAlbum)
        .sort(byPlayCountDesc)
        .slice(0, limit)
        .map((album) => ({
          ...album,
          topTracks: allTracks
            .filter((track) => track.albumId === album.id)
            .sort(byPlayCountDesc)
            .slice(0, 3)
            .map(({ id, track, playCount, url }) => ({ id, track, playCount, url })),
        })),
    };
  }

  private load(): z.infer<typeof fileSchema> {
    try {
      return fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      return { version: 1, tracks: {}, artists: {}, albums: {} };
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(
        tmpPath,
        JSON.stringify({
          version: 1,
          seededAt: this.seededAt,
          lastPlayedAt: this.lastPlayedAt,
          tracks: this.tracks,
          artists: this.artists,
          albums: this.albums,
        }),
        { mode: 0o600 },
      );
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.warn('[spotify] Could not persist play-count history:', (error as Error).message);
    }
  }
}
