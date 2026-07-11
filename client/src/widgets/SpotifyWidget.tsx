import { useState } from 'react';
import type { SpotifyData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetBody, WidgetShell } from '../components/WidgetCard';
import { StaleBadge } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

type Range = 'shortTerm' | 'mediumTerm';
const RANGE_LABEL: Record<Range, string> = { shortTerm: '4 weeks', mediumTerm: '6 months' };

const linkClass = 'truncate font-medium text-ink hover:underline';

function TrackThumb({ url }: { url?: string }) {
  return url ? (
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded-md bg-track" />
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ink-faint">{n}</span>
  );
}

// ── Now playing ────────────────────────────────────────────────────────────

export function NowPlaying({ nowPlaying }: { nowPlaying: SpotifyData['nowPlaying'] }) {
  if (!nowPlaying) {
    return <p className="text-sm text-ink-muted">Nothing playing right now.</p>;
  }
  const pct =
    nowPlaying.durationMs && nowPlaying.progressMs != null
      ? Math.min(100, (nowPlaying.progressMs / nowPlaying.durationMs) * 100)
      : null;

  return (
    <div className="flex gap-4">
      {nowPlaying.imageUrl && (
        <img
          src={nowPlaying.imageUrl}
          alt=""
          className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-lg"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-1 flex items-center gap-2">
          <span className={`spotify-eq ${nowPlaying.isPlaying ? 'spotify-eq--on' : ''}`} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {nowPlaying.isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>
        {nowPlaying.url ? (
          <a href={nowPlaying.url} target="_blank" rel="noreferrer" className="truncate text-base font-semibold text-ink hover:underline">
            {nowPlaying.track}
          </a>
        ) : (
          <p className="truncate text-base font-semibold">{nowPlaying.track}</p>
        )}
        <p className="truncate text-sm text-ink-muted">
          {nowPlaying.artist}
          {nowPlaying.album ? ` · ${nowPlaying.album}` : ''}
        </p>
        {pct !== null && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-(--color-accent-spotify)" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function NowPlayingWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Now playing" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => <NowPlaying nowPlaying={data.nowPlaying} />}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Top artists / tracks (with time-range toggle) ───────────────────────────

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="spotify-range-toggle" role="group" aria-label="Time range">
      {(['shortTerm', 'mediumTerm'] as Range[]).map((r) => (
        <button key={r} type="button" data-active={r === range} onClick={() => onChange(r)}>
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function TopArtistsWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  const [range, setRange] = useState<Range>('shortTerm');
  return (
    <WidgetShell title="Top artists" badge={<RangeToggle range={range} onChange={setRange} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const artists = data.topArtists[range];
          if (artists.length === 0) return <p className="text-sm text-ink-faint">No data yet.</p>;
          return (
            <ol className="space-y-2 text-sm">
              {artists.map((artist, i) => (
                <li key={`${artist.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
                  <Rank n={i + 1} />
                  <TrackThumb url={artist.imageUrl} />
                  <div className="min-w-0">
                    {artist.url ? (
                      <a href={artist.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {artist.name}
                      </a>
                    ) : (
                      <span className="truncate font-medium">{artist.name}</span>
                    )}
                    {artist.genres.length > 0 && (
                      <p className="truncate text-xs text-ink-faint">{artist.genres.slice(0, 2).join(' · ')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

export function TopTracksWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  const [range, setRange] = useState<Range>('shortTerm');
  return (
    <WidgetShell title="Top tracks" badge={<RangeToggle range={range} onChange={setRange} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const tracks = data.topTracks[range];
          if (tracks.length === 0) return <p className="text-sm text-ink-faint">No data yet.</p>;
          return (
            <ol className="space-y-2 text-sm">
              {tracks.map((track, i) => (
                <li key={`${track.track}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
                  <Rank n={i + 1} />
                  <TrackThumb url={track.imageUrl} />
                  <div className="min-w-0">
                    {track.url ? (
                      <a href={track.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {track.track}
                      </a>
                    ) : (
                      <span className="truncate font-medium">{track.track}</span>
                    )}
                    <p className="truncate text-xs text-ink-faint">{track.artist}</p>
                  </div>
                </li>
              ))}
            </ol>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Recently played ─────────────────────────────────────────────────────────

export function RecentlyPlayedWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Recently played" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.recentlyPlayed.length === 0 ? (
            <p className="text-sm text-ink-faint">No recent listening.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentlyPlayed.map((track, i) => (
                <li key={`${track.playedAt}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
                  <TrackThumb url={track.imageUrl} />
                  <div className="min-w-0 flex-1">
                    {track.url ? (
                      <a href={track.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {track.track}
                      </a>
                    ) : (
                      <span className="truncate font-medium">{track.track}</span>
                    )}
                    <p className="truncate text-xs text-ink-faint">{track.artist}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">{relativeTime(track.playedAt)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </WidgetBody>
    </WidgetShell>
  );
}
