import { z } from 'zod';
import type { Sql, TransactionSql } from 'postgres';
import type { Database } from './db/client.js';

const TOP_LIMIT = 100;
/**
 * An album only counts as "listened to" once we've tracked at least this many distinct songs from
 * it — otherwise a single popular track from a 20-track album would rank alongside albums played
 * all the way through. Kept low (not 3+) since per-track coverage is still sparse: only the
 * top-120 stream-count import plus whatever's been organically observed since this feature
 * launched count as "known" tracks, so most albums are represented by just 1-2 songs regardless of
 * how much you've actually listened to them.
 */
const MIN_TRACKED_TRACKS_PER_ALBUM = 2;

/**
 * Album ids that Spotify tags album_type=compilation but that are really a real release someone
 * listens to as an album, not a scattered hits collection — excluded from the compilation filter.
 * Spotify id, not name, since names collide across artists/reissues.
 */
const COMPILATION_TYPE_OVERRIDES = new Set([
  '5EbpxRwbbpCJUepbqVTZ1U', // Trilogy (The Weeknd) — bundles three early mixtapes into one official release
]);

const trackRecordSchema = z.object({
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
const artistRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  genres: z.array(z.string()).default([]),
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
    imageUrl?: string;
    url?: string;
    releaseDate?: string;
    releaseDatePrecision?: 'year' | 'month' | 'day';
    totalTracks?: number;
    albumType?: 'album' | 'single' | 'compilation';
  };
}

export interface AlbumDetailInput {
  id: string;
  totalDurationMs: number;
  totalTracks?: number;
  releaseDatePrecision?: 'year' | 'month' | 'day';
  albumType?: 'album' | 'single' | 'compilation';
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

type TrackRecord = z.infer<typeof trackRecordSchema>;
type ArtistRecord = z.infer<typeof artistRecordSchema>;
type AlbumRecord = z.infer<typeof albumRecordSchema>;

interface ArtistLike {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
  genres?: string[];
}

interface AlbumLike {
  id: string;
  name: string;
  artist: string;
  imageUrl?: string;
  url?: string;
  releaseDate?: string;
  releaseDatePrecision?: 'year' | 'month' | 'day';
  totalTracks?: number;
  albumType?: 'album' | 'single' | 'compilation';
}

const byPlayCountDesc = (a: { playCount: number }, b: { playCount: number }) => b.playCount - a.playCount;

/**
 * Spotify assigns a distinct album id to every reissue (Deluxe/Extended/Anniversary/Remastered/...),
 * which splits one album's plays across several "albums" in getAllTime — e.g. Kiss Land vs. Kiss
 * Land (Deluxe) never accumulate enough tracked tracks individually to clear
 * MIN_TRACKED_TRACKS_PER_ALBUM even though the underlying album is well-tracked. Stripping a
 * trailing edition marker gives editions of the same album a shared grouping key so they can be
 * merged before ranking.
 */
const EDITION_PREFIXES = [
  'deluxe',
  'extended',
  'expanded',
  'anniversary',
  'remaster',
  'remastered',
  'special',
  'super deluxe',
  'bonus',
  'bonus track',
  'bonus track version',
  'explicit',
  'clean',
  'international',
  'complete',
  'revisited',
  'reissue',
];

function isEditionLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return EDITION_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

function editionSuffixStart(name: string): number | undefined {
  const trimmed = name.trim();
  const close = trimmed.at(-1);
  if (close !== ')' && close !== ']') return undefined;

  const open = close === ')' ? '(' : '[';
  const start = trimmed.lastIndexOf(open);
  if (start < 0 || !isEditionLabel(trimmed.slice(start + 1, -1))) return undefined;
  return start;
}

function canonicalAlbumName(name: string): string {
  let result = name;
  for (let suffixStart = editionSuffixStart(result); suffixStart !== undefined; suffixStart = editionSuffixStart(result)) {
    result = result.slice(0, suffixStart).trim();
  }
  return result;
}

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
  private tracks: Record<string, TrackRecord> = {};
  private artists: Record<string, ArtistRecord> = {};
  private albums: Record<string, AlbumRecord> = {};
  private dirty = false;
  private observedPlays: { playedAt: string; trackId: string }[] = [];

  constructor(private readonly database: Database) {}

  async isSeeded(): Promise<boolean> {
    return this.withRead(() => this.isSeededInMemory());
  }

  private isSeededInMemory(): boolean {
    return this.seededAt !== undefined;
  }

  /** One-time backfill from Spotify's long_term top lists. No-ops if already seeded. */
  async seedIfNeeded(input: { artists: SeedArtistInput[]; tracks: PlayedTrackInput[] }): Promise<void> {
    await this.withWrite(() => this.seedIfNeededInMemory(input));
  }

  private seedIfNeededInMemory(input: { artists: SeedArtistInput[]; tracks: PlayedTrackInput[] }): void {
    if (this.isSeededInMemory()) return;

    for (const artist of input.artists) this.upsertArtistMetadata(artist);

    input.tracks.forEach((track, i) => {
      const weight = input.tracks.length - i;
      this.tracks[track.id] = {
        id: track.id,
        track: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        artistIds: track.artists.map((a) => a.id),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: weight,
      };
      for (const artist of track.artists) this.upsertArtistMetadata(artist);
      this.upsertAlbumMetadata({
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision,
        totalTracks: track.album.totalTracks,
        albumType: track.album.albumType,
      });
    });

    this.seededAt = new Date().toISOString();
    this.save();
  }

  /** Records newly-observed plays (played_at newer than the last one processed) from a recentlyPlayed page. */
  async recordPlays(entries: { playedAt: string; track: PlayedTrackInput }[]): Promise<void> {
    await this.withWrite(() => this.recordPlaysInMemory(entries));
  }

  private recordPlaysInMemory(entries: { playedAt: string; track: PlayedTrackInput }[]): void {
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
        artistIds: track.artists.map((a) => a.id),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: (existingTrack?.playCount ?? 0) + 1,
        verified: existingTrack?.verified,
      };

      for (const artist of track.artists) this.upsertArtistMetadata(artist);
      this.upsertAlbumMetadata({
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision,
        totalTracks: track.album.totalTracks,
        albumType: track.album.albumType,
      });

      this.lastPlayedAt = playedAt;
      this.observedPlays.push({ playedAt, trackId: track.id });
    }
    this.save();
  }

  /**
   * Overwrites specific tracks' playCount with real, externally-known stream counts (e.g. from a
   * personally-tracked playlist), rather than the +1-per-observed-play accumulation the rest of
   * this store does. Safe to re-run with updated numbers — it's a set, not an increment.
   */
  async applyRealStreamCounts(entries: { track: PlayedTrackInput; streams: number }[]): Promise<void> {
    await this.withWrite(() => this.applyRealStreamCountsInMemory(entries));
  }

  private applyRealStreamCountsInMemory(entries: { track: PlayedTrackInput; streams: number }[]): void {
    for (const { track, streams } of entries) {
      this.tracks[track.id] = {
        id: track.id,
        track: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        artistIds: track.artists.map((a) => a.id),
        album: track.album.name,
        albumId: track.album.id,
        releaseDate: track.album.releaseDate,
        durationMs: track.durationMs,
        imageUrl: track.album.imageUrl,
        url: track.url,
        playCount: streams,
        verified: true,
      };

      for (const artist of track.artists) this.upsertArtistMetadata(artist);
      this.upsertAlbumMetadata({
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision,
        totalTracks: track.album.totalTracks,
        albumType: track.album.albumType,
      });
    }
    this.save();
  }

  /** Backfills image/url/genres for accumulated artists once they show up in a top-artists fetch — recentlyPlayed alone never carries artist images. */
  async mergeArtistMetadata(metadata: ArtistMetadataInput[]): Promise<void> {
    await this.withWrite(() => this.mergeArtistMetadataInMemory(metadata));
  }

  private mergeArtistMetadataInMemory(metadata: ArtistMetadataInput[]): void {
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

  /** Album ids missing duration/track-count/albumType, or that still have a tracked track missing artistIds — one fetch per id (see providers/spotify.ts). Re-checked on every call so an album already enriched before a field existed still gets revisited once that field needs backfilling. */
  async getAlbumIdsNeedingDurations(limit: number): Promise<string[]> {
    return this.withRead(() => this.getAlbumIdsNeedingDurationsInMemory(limit));
  }

  private getAlbumIdsNeedingDurationsInMemory(limit: number): string[] {
    const tracksByAlbum = new Map<string, TrackRecord[]>();
    for (const track of Object.values(this.tracks)) {
      if (!track.albumId) continue;
      const list = tracksByAlbum.get(track.albumId);
      if (list) list.push(track);
      else tracksByAlbum.set(track.albumId, [track]);
    }
    return Object.values(this.albums)
      .filter((album) => {
        if (album.totalDurationMs === undefined || album.totalTracks === undefined) return true;
        if (album.albumType === undefined) return true;
        return (tracksByAlbum.get(album.id) ?? []).some((track) => track.artistIds.length === 0);
      })
      .slice(0, limit)
      .map((album) => album.id);
  }

  /**
   * Applies a fetched album's authoritative metadata, and — since the same response carries the
   * album's full tracklist (including each track's artists) — self-heals `albumId`/`artistIds` on
   * any of our own track records that predate those fields (or otherwise drifted), so per-album
   * top tracks and artist totals stay correct without waiting for those tracks to be replayed.
   */
  async enrichAlbumDetails(details: AlbumDetailInput[]): Promise<void> {
    await this.withWrite(() => this.enrichAlbumDetailsInMemory(details));
  }

  private enrichAlbumDetailsInMemory(details: AlbumDetailInput[]): void {
    let changed = false;
    for (const detail of details) {
      const existing = this.albums[detail.id];
      if (existing) {
        this.albums[detail.id] = {
          ...existing,
          totalDurationMs: detail.totalDurationMs,
          totalTracks: detail.totalTracks ?? existing.totalTracks,
          releaseDatePrecision: detail.releaseDatePrecision ?? existing.releaseDatePrecision,
          albumType: detail.albumType ?? existing.albumType,
        };
        changed = true;
      }
      for (const trackInfo of detail.tracks) {
        const track = this.tracks[trackInfo.id];
        if (!track) continue;
        const needsAlbumId = track.albumId !== detail.id;
        const needsArtistIds = track.artistIds.length === 0 && trackInfo.artistIds.length > 0;
        if (needsAlbumId || needsArtistIds) {
          this.tracks[trackInfo.id] = {
            ...track,
            albumId: detail.id,
            artistIds: needsArtistIds ? trackInfo.artistIds : track.artistIds,
          };
          changed = true;
        }
      }
    }
    if (changed) this.save();
  }

  /**
   * Backfills artistIds/albumId/album metadata (esp. albumType, needed to filter out compilations)
   * on existing track/album records that predate those fields — sourced from tracks we're already
   * fetching for other purposes (top tracks), so this costs no extra Spotify API calls and doesn't
   * depend on the rate-limit-prone per-album enrichment fetch in enrichAlbumDetails. Never creates
   * new records or touches playCount; a pure metadata heal for tracks the store already knows.
   */
  async healTrackMetadata(tracks: PlayedTrackInput[]): Promise<void> {
    await this.withWrite(() => this.healTrackMetadataInMemory(tracks));
  }

  private healTrackMetadataInMemory(tracks: PlayedTrackInput[]): void {
    let changed = false;
    for (const track of tracks) {
      const existing = this.tracks[track.id];
      if (!existing) continue;

      const artistIds = existing.artistIds.length > 0 ? existing.artistIds : track.artists.map((a) => a.id);
      const albumId = existing.albumId ?? track.album.id;
      if (artistIds !== existing.artistIds || albumId !== existing.albumId) {
        this.tracks[track.id] = { ...existing, artistIds, albumId };
        changed = true;
      }

      for (const artist of track.artists) this.upsertArtistMetadata(artist);

      const existingAlbum = this.albums[track.album.id];
      this.upsertAlbumMetadata({
        id: track.album.id,
        name: track.album.name,
        artist: track.artists.map((a) => a.name).join(', '),
        imageUrl: track.album.imageUrl,
        url: track.album.url,
        releaseDate: track.album.releaseDate,
        releaseDatePrecision: track.album.releaseDatePrecision,
        totalTracks: track.album.totalTracks,
        albumType: track.album.albumType,
      });
      if (!existingAlbum || existingAlbum.albumType !== this.albums[track.album.id]?.albumType) changed = true;
    }
    if (changed) this.save();
  }

  async getAllTime(
    limit = TOP_LIMIT,
    minTrackedTracksPerAlbum = MIN_TRACKED_TRACKS_PER_ALBUM,
  ): Promise<{
    trackedSince: string | undefined;
    artists: (ArtistRecord & { playCount: number })[];
    tracks: TrackRecord[];
    albums: (AlbumRecord & { playCount: number; topTracks: { id: string; track: string; playCount: number; url?: string }[] })[];
  }> {
    return this.withRead(() => this.getAllTimeInMemory(limit, minTrackedTracksPerAlbum));
  }

  private getAllTimeInMemory(
    limit = TOP_LIMIT,
    minTrackedTracksPerAlbum = MIN_TRACKED_TRACKS_PER_ALBUM,
  ): {
    trackedSince: string | undefined;
    artists: (ArtistRecord & { playCount: number })[];
    tracks: TrackRecord[];
    albums: (AlbumRecord & { playCount: number; topTracks: { id: string; track: string; playCount: number; url?: string }[] })[];
  } {
    const allTracks = Object.values(this.tracks);

    // Artist/album totals are summed fresh from tracks every call — the only source of truth.
    // Only the primary (first-listed) artist counts toward "top artists" — crediting every
    // collaborator the track's full count would let a one-off guest feature (e.g. a producer or
    // a single duet partner) outrank artists whose own albums you actually listen to.
    const artistPlayCounts = new Map<string, number>();
    const albumPlayCounts = new Map<string, number>();
    for (const track of allTracks) {
      const primaryArtistId = track.artistIds[0];
      if (primaryArtistId) {
        artistPlayCounts.set(primaryArtistId, (artistPlayCounts.get(primaryArtistId) ?? 0) + track.playCount);
      }
      if (track.albumId) {
        albumPlayCounts.set(track.albumId, (albumPlayCounts.get(track.albumId) ?? 0) + track.playCount);
      }
    }

    // Group album editions (Deluxe/Extended/...) that share a canonical name + artist so their
    // plays combine into one entry instead of each edition separately falling short of
    // minTrackedTracksPerAlbum — see canonicalAlbumName.
    const editionGroups = new Map<string, AlbumRecord[]>();
    for (const album of Object.values(this.albums)) {
      if (album.albumType === 'compilation' && !COMPILATION_TYPE_OVERRIDES.has(album.id)) continue;
      // Key on the primary (first-listed) artist only — a deluxe reissue often adds a bonus-track
      // guest to the album credits (e.g. "The Weeknd" vs "The Weeknd, Ariana Grande"), which would
      // otherwise keep it from grouping with the base edition.
      const primaryArtist = album.artist.split(',')[0]?.trim().toLowerCase() ?? '';
      const key = `${canonicalAlbumName(album.name).toLowerCase()}|${primaryArtist}`;
      const list = editionGroups.get(key);
      if (list) list.push(album);
      else editionGroups.set(key, [album]);
    }

    const albums = [...editionGroups.values()]
      .map((editions) => {
        const albumIds = new Set(editions.map((a) => a.id));
        const groupTracks = allTracks.filter((t) => t.albumId && albumIds.has(t.albumId));
        // Prefer the edition whose own name has no edition suffix (the base release) as the
        // display record; fall back to whichever edition has been played the most.
        const canonical =
          editions.find((a) => canonicalAlbumName(a.name) === a.name) ??
          editions.slice().sort((a, b) => (albumPlayCounts.get(b.id) ?? 0) - (albumPlayCounts.get(a.id) ?? 0))[0];
        return {
          canonical,
          playCount: groupTracks.reduce((sum, t) => sum + t.playCount, 0),
          trackedCount: groupTracks.length,
          groupTracks,
        };
      })
      .filter(({ trackedCount }) => trackedCount >= minTrackedTracksPerAlbum)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit)
      .map(({ canonical, playCount, groupTracks }) => ({
        ...canonical,
        playCount,
        topTracks: groupTracks
          .slice()
          .sort(byPlayCountDesc)
          .slice(0, 3)
          .map(({ id, track, playCount: trackPlayCount, url }) => ({ id, track, playCount: trackPlayCount, url })),
      }));

    return {
      trackedSince: this.seededAt,
      artists: Object.values(this.artists)
        .map((artist) => ({ ...artist, playCount: artistPlayCounts.get(artist.id) ?? 0 }))
        .filter((artist) => artist.playCount > 0)
        .sort(byPlayCountDesc)
        .slice(0, limit),
      tracks: allTracks.sort(byPlayCountDesc).slice(0, limit),
      albums,
    };
  }

  /** Fills in an artist's metadata, preserving any richer values (image/url/genres) already on record rather than overwriting them with blanks from a source that doesn't carry them (e.g. a bare track credit). */
  private upsertArtistMetadata(artist: ArtistLike): void {
    const existing = this.artists[artist.id];
    this.artists[artist.id] = {
      id: artist.id,
      name: artist.name,
      imageUrl: existing?.imageUrl ?? artist.imageUrl,
      url: existing?.url ?? artist.url,
      genres: existing && existing.genres.length > 0 ? existing.genres : (artist.genres ?? []),
    };
  }

  private upsertAlbumMetadata(album: AlbumLike): void {
    const existing = this.albums[album.id];
    this.albums[album.id] = {
      id: album.id,
      name: album.name,
      artist: album.artist,
      imageUrl: album.imageUrl ?? existing?.imageUrl,
      url: album.url ?? existing?.url,
      releaseDate: album.releaseDate ?? existing?.releaseDate,
      releaseDatePrecision: album.releaseDatePrecision ?? existing?.releaseDatePrecision,
      totalTracks: album.totalTracks ?? existing?.totalTracks,
      albumType: album.albumType ?? existing?.albumType,
      totalDurationMs: existing?.totalDurationMs,
    };
  }

  /** Existing derivation helpers mutate this in-memory state; the surrounding transaction persists it. */
  private save(): void {
    this.dirty = true;
  }

  private async withRead<T>(read: () => T): Promise<T> {
    await this.load(this.database.client);
    return read();
  }

  private async withWrite<T>(write: () => T): Promise<T> {
    const result = await this.database.client.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtext('spotify-history'))`;
      await this.load(sql);
      this.dirty = false;
      this.observedPlays = [];
      const result = write();
      if (this.dirty) await this.persist(sql);
      return result;
    });
    return result as T;
  }

  private async load(sql: Sql | TransactionSql): Promise<void> {
    const [metaRows, trackRows, artistRows, albumRows] = await Promise.all([
      sql<{ seeded_at: string | null; last_played_at: string | null }[]>`select seeded_at, last_played_at from spotify_history_meta where id = 1`,
      sql<Record<string, unknown>[]>`select * from spotify_tracks`,
      sql<Record<string, unknown>[]>`select * from spotify_artists`,
      sql<Record<string, unknown>[]>`select * from spotify_albums`,
    ]);
    const meta = metaRows[0];
    this.seededAt = meta?.seeded_at ?? undefined;
    this.lastPlayedAt = meta?.last_played_at ?? undefined;
    this.tracks = Object.fromEntries(trackRows.map((row) => {
      const record = trackRecordSchema.parse({
        id: row.id,
        track: row.track,
        artist: row.artist,
        artistIds: row.artist_ids,
        album: row.album ?? undefined,
        albumId: row.album_id ?? undefined,
        releaseDate: row.release_date ?? undefined,
        durationMs: row.duration_ms ?? undefined,
        imageUrl: row.image_url ?? undefined,
        url: row.url ?? undefined,
        playCount: row.play_count,
        verified: row.verified ?? undefined,
      });
      return [record.id, record];
    }));
    this.artists = Object.fromEntries(artistRows.map((row) => {
      const record = artistRecordSchema.parse({
        id: row.id,
        name: row.name,
        imageUrl: row.image_url ?? undefined,
        url: row.url ?? undefined,
        genres: row.genres,
      });
      return [record.id, record];
    }));
    this.albums = Object.fromEntries(albumRows.map((row) => {
      const record = albumRecordSchema.parse({
        id: row.id,
        name: row.name,
        artist: row.artist,
        imageUrl: row.image_url ?? undefined,
        url: row.url ?? undefined,
        releaseDate: row.release_date ?? undefined,
        releaseDatePrecision: row.release_date_precision ?? undefined,
        totalTracks: row.total_tracks ?? undefined,
        totalDurationMs: row.total_duration_ms ?? undefined,
        albumType: row.album_type ?? undefined,
      });
      return [record.id, record];
    }));
  }

  private async persist(sql: Sql | TransactionSql): Promise<void> {
    await sql`delete from spotify_tracks`;
    await sql`delete from spotify_artists`;
    await sql`delete from spotify_albums`;
    const tracks = Object.values(this.tracks).map((track) => ({
      id: track.id, track: track.track, artist: track.artist, artist_ids: track.artistIds,
      album: track.album ?? null, album_id: track.albumId ?? null, release_date: track.releaseDate ?? null,
      duration_ms: track.durationMs ?? null, image_url: track.imageUrl ?? null, url: track.url ?? null,
      play_count: track.playCount, verified: track.verified ?? null,
    }));
    const artists = Object.values(this.artists).map((artist) => ({
      id: artist.id, name: artist.name, image_url: artist.imageUrl ?? null, url: artist.url ?? null, genres: artist.genres,
    }));
    const albums = Object.values(this.albums).map((album) => ({
      id: album.id, name: album.name, artist: album.artist, image_url: album.imageUrl ?? null, url: album.url ?? null,
      release_date: album.releaseDate ?? null, release_date_precision: album.releaseDatePrecision ?? null,
      total_tracks: album.totalTracks ?? null, total_duration_ms: album.totalDurationMs ?? null, album_type: album.albumType ?? null,
    }));
    if (tracks.length) await sql`insert into spotify_tracks ${sql(tracks, 'id', 'track', 'artist', 'artist_ids', 'album', 'album_id', 'release_date', 'duration_ms', 'image_url', 'url', 'play_count', 'verified')}`;
    if (artists.length) await sql`insert into spotify_artists ${sql(artists, 'id', 'name', 'image_url', 'url', 'genres')}`;
    if (albums.length) await sql`insert into spotify_albums ${sql(albums, 'id', 'name', 'artist', 'image_url', 'url', 'release_date', 'release_date_precision', 'total_tracks', 'total_duration_ms', 'album_type')}`;
    await sql`
      insert into spotify_history_meta (id, seeded_at, last_played_at) values (1, ${this.seededAt ?? null}, ${this.lastPlayedAt ?? null})
      on conflict (id) do update set seeded_at = excluded.seeded_at, last_played_at = excluded.last_played_at
    `;
    if (this.observedPlays.length) {
      await sql`insert into spotify_observed_plays ${sql(this.observedPlays.map((play) => ({ played_at: play.playedAt, track_id: play.trackId })), 'played_at', 'track_id')} on conflict do nothing`;
    }
  }
}
