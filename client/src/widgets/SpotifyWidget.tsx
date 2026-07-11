import { useState } from 'react';
import type { SpotifyData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { StaleBadge, WidgetBody, WidgetShell } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

type Range = 'shortTerm' | 'mediumTerm';
const RANGE_LABEL: Record<Range, string> = { shortTerm: '4 weeks', mediumTerm: '6 months' };

type Track = SpotifyData['topTracks']['shortTerm'][number];
type Artist = SpotifyData['topArtists']['shortTerm'][number];

const linkClass = 'truncate font-medium text-ink hover:underline';
const accent = 'var(--color-accent-spotify)';

function Thumb({ url, size = 'h-10 w-10' }: { url?: string; size?: string }) {
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-md object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-md bg-track`} />
  );
}

function Rank({ n }: Readonly<{ n: number }>) {
  return <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">{n}</span>;
}

function TrackRow({ track, rank }: Readonly<{ track: Track; rank: number }>) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
      <Rank n={rank} />
      <Thumb url={track.imageUrl} />
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
  );
}

// ── Now playing ────────────────────────────────────────────────────────────

export function NowPlaying({ nowPlaying }: Readonly<{ nowPlaying: SpotifyData['nowPlaying'] }>) {
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
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
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

// ── Time-range toggle ───────────────────────────────────────────────────────

function RangeToggle({ range, onChange }: Readonly<{ range: Range; onChange: (r: Range) => void }>) {
  return (
    <fieldset className="spotify-range-toggle" aria-label="Time range">
      {(['shortTerm', 'mediumTerm'] as Range[]).map((r) => (
        <button key={r} type="button" data-active={r === range} onClick={() => onChange(r)}>
          {RANGE_LABEL[r]}
        </button>
      ))}
    </fieldset>
  );
}

// ── Top artists (grid) + featured #1 track ─────────────────────────────────

function FeaturedTrack({ track, label }: { track: Track; label: string }) {
  const content = (
    <>
      <Thumb url={track.imageUrl} size="h-16 w-16 sm:h-20 sm:w-20" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
          Your #1 track · {label}
        </p>
        <p className="mt-0.5 truncate text-base font-semibold text-ink">{track.track}</p>
        <p className="truncate text-sm text-ink-muted">{track.artist}</p>
      </div>
    </>
  );
  const className =
    'col-span-full flex items-center gap-4 rounded-2xl border border-card-border p-3 transition hover:border-white/15 sm:p-4';
  const style = { background: `color-mix(in oklab, ${accent} 10%, var(--color-card))` };
  return track.url ? (
    <a href={track.url} target="_blank" rel="noreferrer" className={`${className} group`} style={style}>
      {content}
    </a>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

function ArtistCell({ artist, rank }: { artist: Artist; rank: number }) {
  const inner = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-track">
        {artist.imageUrl && (
          <img
            src={artist.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-xs font-medium tabular-nums text-white">
          {rank}
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-ink">{artist.name}</p>
      {artist.genres[0] && <p className="truncate text-xs text-ink-faint">{artist.genres[0]}</p>}
    </>
  );
  return artist.url ? (
    <a href={artist.url} target="_blank" rel="noreferrer" className="group block">
      {inner}
    </a>
  ) : (
    <div className="group block">{inner}</div>
  );
}

export function TopArtistsWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  const [range, setRange] = useState<Range>('shortTerm');
  return (
    <WidgetShell title="Top artists" badge={<RangeToggle range={range} onChange={setRange} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const artists = data.topArtists[range].slice(0, 8);
          const topTrack = data.topTracks[range][0];
          if (artists.length === 0 && !topTrack) {
            return <p className="text-sm text-ink-faint">No data yet.</p>;
          }
          return (
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
              {topTrack && <FeaturedTrack track={topTrack} label={RANGE_LABEL[range]} />}
              {artists.map((artist, i) => (
                <ArtistCell key={`${artist.name}-${i}`} artist={artist} rank={i + 1} />
              ))}
            </div>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Top tracks (up to 50, scrollable) ──────────────────────────────────────

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
            <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1 text-sm">
              {tracks.map((track, i) => (
                <TrackRow key={`${track.track}-${i}`} track={track} rank={i + 1} />
              ))}
            </ol>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Recently played (up to 50, scrollable) ─────────────────────────────────

export function RecentlyPlayedWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Recently played" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.recentlyPlayed.length === 0 ? (
            <p className="text-sm text-ink-faint">No recent listening.</p>
          ) : (
            <ul className="max-h-[34rem] space-y-2 overflow-y-auto pr-1 text-sm">
              {data.recentlyPlayed.map((track, i) => (
                <li key={`${track.playedAt}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
                  <Thumb url={track.imageUrl} />
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
