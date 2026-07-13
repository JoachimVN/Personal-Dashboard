import { spotifySchema, type SpotifyData } from '@personal-dashboard/shared';
import { readSpotifyToken, writeSpotifyToken } from '../spotifyToken.js';
import { SpotifySnapshotStore } from '../spotifyCache.js';
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
  name: string;
  images?: RawImage[];
  genres?: string[];
  external_urls?: { spotify?: string };
}
interface RawTrack {
  name: string;
  duration_ms?: number;
  artists: { name: string }[];
  album?: { name?: string; images?: RawImage[]; release_date?: string };
  external_urls?: { spotify?: string };
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

function mapTrack(track: RawTrack) {
  return {
    track: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album?.name,
    releaseDate: track.album?.release_date,
    imageUrl: firstImage(track.album?.images),
    url: track.external_urls?.spotify,
  };
}

function mapArtist(artist: RawArtist) {
  return {
    name: artist.name,
    imageUrl: firstImage(artist.images),
    url: artist.external_urls?.spotify,
    genres: artist.genres ?? [],
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

export function createSpotifyProvider(
  oauth: { clientId: string; clientSecret: string } | undefined,
  snapshotStore: SpotifySnapshotStore,
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

        if (!topData || Date.now() - topDataFetchedAt >= TOP_DATA_REFRESH_MS) {
          const [artistsShort, artistsMedium, tracksShort, tracksMedium] = await Promise.all([
            get<TopResponse<RawArtist>>('/me/top/artists?time_range=short_term&limit=8'),
            get<TopResponse<RawArtist>>('/me/top/artists?time_range=medium_term&limit=8'),
            get<TopResponse<RawTrack>>('/me/top/tracks?time_range=short_term&limit=50'),
            get<TopResponse<RawTrack>>('/me/top/tracks?time_range=medium_term&limit=50'),
          ]);
          topData = {
            artistsShort: artistsShort?.items ?? [],
            artistsMedium: artistsMedium?.items ?? [],
            tracksShort: tracksShort?.items ?? [],
            tracksMedium: tracksMedium?.items ?? [],
          };
          topDataFetchedAt = Date.now();
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
