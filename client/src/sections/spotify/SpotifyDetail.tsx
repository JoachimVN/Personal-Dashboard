import type { SpotifyData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import {
  NowPlayingWidget,
  RecentlyPlayedWidget,
  TopAlbumsWidget,
  TopArtistsWidget,
  TopTracksWidget,
} from '../../widgets/SpotifyWidget';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './spotify.css';

function SpotifySignals() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <div className="detail-signal-panel">
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const np = data.nowPlaying;
          const topArtist = data.topArtists.shortTerm[0];
          const topTrack = data.topTracks.shortTerm[0];
          let playbackStatus = 'Idle';
          if (np) {
            playbackStatus = np.isPlaying ? 'Live' : 'Paused';
          }
          return (
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3">
              <div className="row-span-2 text-center">
                <p className="text-3xl" aria-hidden>
                  {np?.isPlaying ? '♪' : '♫'}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  {playbackStatus}
                </p>
              </div>
              <div className="min-w-0 border-l border-card-border pl-5">
                <p className="truncate text-sm font-medium">{np?.track ?? 'Nothing playing'}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                  {np?.artist ?? 'Start something on Spotify'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-card-border pl-5 text-xs text-ink-muted">
                <span>{topArtist ? `Top artist · ${topArtist.name}` : 'Top artist syncing'}</span>
                <span>{topTrack ? `Top track · ${topTrack.track}` : 'Top track syncing'}</span>
              </div>
            </div>
          );
        }}
      </WidgetBody>
    </div>
  );
}

export function SpotifyDetail() {
  return (
    <div>
      <DetailIntro
        eyebrow="Listening"
        title={
          <>
            The soundtrack
            <br />
            <span className="text-ink-faint">to your work.</span>
          </>
        }
        description="What's on now, the artists and tracks you keep returning to, and where you've just been."
        accent="var(--color-accent-spotify)"
      >
        <SpotifySignals />
      </DetailIntro>
      <DetailSectionHeading label="On now" title="What's playing" />
      <NowPlayingWidget />
      <DetailSectionHeading
        label="On repeat"
        title="Your rotation"
        detail="Toggle the top cards between the last 4 weeks, the last 6 months, and all time — all-time counts and top albums build up the longer this dashboard keeps running."
      />
      <div className="space-y-4">
        <TopArtistsWidget />
        <TopAlbumsWidget />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopTracksWidget />
          <RecentlyPlayedWidget />
        </div>
      </div>
    </div>
  );
}
