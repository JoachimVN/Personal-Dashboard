import type { SpotifyData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { NowPlaying } from '../../widgets/SpotifyWidget';
import './spotify.css';

export function SpotifyOverview() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const topArtists = data.topArtists.shortTerm.slice(0, 3);
        return (
          <div className="space-y-4">
            <NowPlaying nowPlaying={data.nowPlaying} />
            {topArtists.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-card-border pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Top artists
                </span>
                {topArtists.map((artist) => (
                  <span
                    key={artist.name}
                    className="rounded-full bg-track/40 px-2.5 py-0.5 text-xs text-ink-muted"
                  >
                    {artist.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </WidgetBody>
  );
}
