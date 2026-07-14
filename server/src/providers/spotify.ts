import { spotifySchema, type SpotifyData } from '@personal-dashboard/shared';
import { readSpotifyToken, writeSpotifyToken } from '../spotifyToken.js';
import { SpotifySnapshotStore } from '../spotifyCache.js';
import { SpotifyHistoryStore, type AlbumDetailInput, type PlayedTrackInput } from '../spotifyHistory.js';
import type { Provider } from '../scheduler.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const TOP_DATA_REFRESH_MS = 15 * 60_000;
const DEFAULT_RATE_LIMIT_RETRY_MS = 30_000;

// Raw Spotify shapes (only the fields we read).
interface RawImage {
  url: string;
}
interface RawArtist {
  id: string;
  name: string;
  images?: RawImage[];
  genres?: string[];
  external_urls?: { spotify?: string };
}
interface RawTrack {
  id: string;
  name: string;
  duration_ms?: number;
  artists: { id: string; name: string }[];
  album?: {
    id: string;
    name?: string;
    images?: RawImage[];
    release_date?: string;
    release_date_precision?: string;
    total_tracks?: number;
    external_urls?: { spotify?: string };
  };
  external_urls?: { spotify?: string };
}
interface RawAlbumDetail {
  id: string;
  total_tracks?: number;
  release_date_precision?: string;
  tracks?: { items?: { id?: string; duration_ms?: number }[] };
}
interface CurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: RawTrack | null;
}
interface RecentlyPlayed {
  items: { track: RawTrack; played_at: string }[];
}
interface TopResponse<T> {
  items: T[];
}

interface TopData {
  artistsShort: RawArtist[];
  artistsMedium: RawArtist[];
  tracksShort: RawTrack[];
  tracksMedium: RawTrack[];
}

const firstImage = (images?: RawImage[]) => images?.[0]?.url;

function toReleaseDatePrecision(precision?: string): 'year' | 'month' | 'day' | undefined {
  return precision === 'year' || precision === 'month' || precision === 'day' ? precision : undefined;
}

function mapTrack(track: RawTrack) {
  return {
    id: track.id,
    track: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album?.name,
    releaseDate: track.album?.release_date,
    durationMs: track.duration_ms,
    imageUrl: firstImage(track.album?.images),
    url: track.external_urls?.spotify,
  };
}

function mapArtist(artist: RawArtist) {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: firstImage(artist.images),
    url: artist.external_urls?.spotify,
    genres: artist.genres ?? [],
  };
}

/** Shapes a raw track for history recording/seeding — undefined for tracks missing the ids we need to dedupe on (e.g. local files). */
function toPlayedTrackInput(track: RawTrack): PlayedTrackInput | undefined {
  if (!track.id || !track.album?.id) return undefined;
  return {
    id: track.id,
    name: track.name,
    url: track.external_urls?.spotify,
    durationMs: track.duration_ms,
    artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
    album: {
      id: track.album.id,
      name: track.album.name ?? 'Unknown album',
      imageUrl: firstImage(track.album.images),
      url: track.album.external_urls?.spotify,
      releaseDate: track.album.release_date,
      releaseDatePrecision: toReleaseDatePrecision(track.album.release_date_precision),
      totalTracks: track.album.total_tracks,
    },
  };
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('spotify rate limited');
}

/**
 * Returns a valid access token, refreshing (and re-persisting) via the stored
 * refresh_token when the current one is within a minute of expiry. Never logs
 * response bodies — Spotify's token responses carry the tokens themselves.
 */
async function accessToken(
  oauth: { clientId: string; clientSecret: string },
  signal: AbortSignal,
): Promise<string> {
  const token = readSpotifyToken();
  if (!token) throw new Error('spotify is not configured');
  if (token.expires_at - Date.now() > 60_000) return token.access_token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`spotify token refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  // Spotify may omit refresh_token on refresh — keep the existing one when it does.
  const next = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  writeSpotifyToken(next);
  return next.access_token;
}

/** Spotify caps `limit` at 50/call for top-items endpoints, so paginate with `offset` to get more. */
async function getTopTracks(
  get: <T>(path: string) => Promise<T | null>,
  timeRange: 'short_term' | 'medium_term' | 'long_term',
  total: number,
): Promise<RawTrack[]> {
  const pageSize = 50;
  const results: RawTrack[] = [];
  for (let offset = 0; offset < total; offset += pageSize) {
    const limit = Math.min(pageSize, total - offset);
    const page = await get<TopResponse<RawTrack>>(
      `/me/top/tracks?time_range=${timeRange}&limit=${limit}&offset=${offset}`,
    );
    const items = page?.items ?? [];
    results.push(...items);
    if (items.length < limit) break; // fewer than requested means there's nothing more to page through
  }
  return results;
}

export function createSpotifyProvider(
  oauth: { clientId: string; clientSecret: string } | undefined,
  snapshotStore: SpotifySnapshotStore,
  historyStore: SpotifyHistoryStore,
): Provider<SpotifyData> {
  let topData: TopData | undefined;
  let topDataFetchedAt = 0;

  return {
    id: 'spotify',
    schema: spotifySchema,
    refreshMs: 60_000,
    timeoutMs: 20_000,
    isConfigured: () => oauth !== undefined && readSpotifyToken() !== undefined,
    async fetch(signal) {
      if (!oauth) throw new Error('spotify is not configured');
      try {
        const bearer = await accessToken(oauth, signal);

        const get = async <T>(path: string): Promise<T | null> => {
          const retryInMs = snapshotStore.getRateLimitedUntil() - Date.now();
          if (retryInMs > 0) {
            throw new Error(`spotify rate limited; retry in ${Math.ceil(retryInMs / 1000)} seconds`);
          }
          const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${bearer}` },
            signal,
          });
          if (res.status === 204) return null; // e.g. nothing currently playing
          if (res.status === 429) {
            const retryAfterSeconds = Number(res.headers.get('retry-after'));
            const retryAfterMs =
              Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
                ? retryAfterSeconds * 1000
                : DEFAULT_RATE_LIMIT_RETRY_MS;
            snapshotStore.setRateLimitedUntil(Date.now() + retryAfterMs);
            throw new Error(`spotify rate limited; retry in ${Math.ceil(retryAfterMs / 1000)} seconds`);
          }
          if (!res.ok) throw new Error(`spotify ${path} failed: ${res.status}`);
          return (await res.json()) as T;
        };

        const [current, recent] = await Promise.all([
          get<CurrentlyPlaying>('/me/player/currently-playing'),
          get<RecentlyPlayed>('/me/player/recently-played?limit=50'),
        ]);

        let topDataRefreshed = false;
        if (!topData || Date.now() - topDataFetchedAt >= TOP_DATA_REFRESH_MS) {
          const [artistsShort, artistsMedium, tracksShort, tracksMedium] = await Promise.all([
            get<TopResponse<RawArtist>>('/me/top/artists?time_range=short_term&limit=8'),
            get<TopResponse<RawArtist>>('/me/top/artists?time_range=medium_term&limit=8'),
            getTopTracks(get, 'short_term', 100),
            getTopTracks(get, 'medium_term', 100),
          ]);
          topData = {
            artistsShort: artistsShort?.items ?? [],
            artistsMedium: artistsMedium?.items ?? [],
            tracksShort,
            tracksMedium,
          };
          topDataFetchedAt = Date.now();
          topDataRefreshed = true;
        }

        // One-time backfill from Spotify's long_term (~years) top lists, so all-time stats
        // aren't empty on day one — real observed plays accrue on top from here.
        if (!historyStore.isSeeded()) {
          const [artistsLong, tracksLong] = await Promise.all([
            get<TopResponse<RawArtist>>('/me/top/artists?time_range=long_term&limit=50'),
            getTopTracks(get, 'long_term', 100),
          ]);
          historyStore.seedIfNeeded({
            artists: (artistsLong?.items ?? []).map(mapArtist),
            tracks: tracksLong.map(toPlayedTrackInput).filter((t): t is PlayedTrackInput => t !== undefined),
          });
        }

        const recentPlays = (recent?.items ?? [])
          .map((entry) => {
            const track = toPlayedTrackInput(entry.track);
            return track ? { playedAt: entry.played_at, track } : undefined;
          })
          .filter((e): e is { playedAt: string; track: PlayedTrackInput } => e !== undefined);
        historyStore.recordPlays(recentPlays);

        // Backfill full album duration/metadata once per album (max 5/cycle) — duration needs a
        // dedicated fetch (doesn't come along for free on track/top-list responses), and the same
        // response's tracklist also self-heals albumId on any track records that predate that
        // field. Spotify's Nov 2024 API policy locked the batched "Get Several Albums" endpoint
        // behind Extended Quota Mode approval (403 for dev-mode apps like this one), but the
        // singular per-album endpoint is still open, so fetch one at a time. Failures (e.g. a
        // removed album) are swallowed per-item and simply retried next cycle.
        const pendingAlbumIds = historyStore.getAlbumIdsNeedingDurations(5);
        if (pendingAlbumIds.length > 0) {
          const details = await Promise.all(
            pendingAlbumIds.map((id) => get<RawAlbumDetail>(`/albums/${id}`).catch(() => null)),
          );
          const enrichments: AlbumDetailInput[] = details
            .filter((album): album is RawAlbumDetail => album !== null)
            .map((album) => ({
              id: album.id,
              totalDurationMs: (album.tracks?.items ?? []).reduce(
                (sum, t) => sum + (t.duration_ms ?? 0),
                0,
              ),
              totalTracks: album.total_tracks,
              releaseDatePrecision: toReleaseDatePrecision(album.release_date_precision),
              trackIds: (album.tracks?.items ?? [])
                .map((t) => t.id)
                .filter((id): id is string => id !== undefined),
            }));
          historyStore.enrichAlbumDetails(enrichments);
        }

        if (topDataRefreshed) {
          historyStore.mergeArtistMetadata(
            [...topData.artistsShort, ...topData.artistsMedium].map(mapArtist),
          );
        }

        const nowPlaying =
          current?.item
            ? {
                ...mapTrack(current.item),
                isPlaying: current.is_playing,
                progressMs: current.progress_ms,
                durationMs: current.item.duration_ms ?? null,
              }
            : null;

        const snapshot = {
          nowPlaying,
          recentlyPlayed: (recent?.items ?? []).map((entry) => ({
            ...mapTrack(entry.track),
            playedAt: entry.played_at,
          })),
          topArtists: {
            shortTerm: topData.artistsShort.map(mapArtist),
            mediumTerm: topData.artistsMedium.map(mapArtist),
          },
          topTracks: {
            shortTerm: topData.tracksShort.map(mapTrack),
            mediumTerm: topData.tracksMedium.map(mapTrack),
          },
          allTime: historyStore.getAllTime(),
        };
        snapshotStore.setSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        const lastGoodSnapshot = snapshotStore.getSnapshot();
        if (lastGoodSnapshot && isRateLimitError(error)) return lastGoodSnapshot;
        throw error;
      }
    },
  };
}
