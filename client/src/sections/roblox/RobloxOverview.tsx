import { useEffect, useRef } from 'react';
import type { RobloxData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { RobloxGames, RobloxNowPlaying, RobloxProfileStats } from '../../widgets/RobloxWidgets';
import './roblox.css';

/* The whole overview card is one link (see SectionCard), same convention as SteamOverview. */

export function RobloxOverview() {
  const { envelope, offline } = useWidget<RobloxData>('roblox');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => <RobloxOverviewContent data={data} />}
    </WidgetBody>
  );
}

function RobloxOverviewContent({ data }: Readonly<{ data: RobloxData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const showGames = data.availability.favoriteGames !== 'unauthorized' && data.games.length > 0;

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--roblox');
    if (!card) return undefined;
    const avatarUrl = data.profile.avatarUrl;
    if (!avatarUrl) {
      card.style.removeProperty('--roblox-card-art');
      return undefined;
    }
    // Probe the image before wiring it into the background — a bare CSS url() with no onload/onerror
    // hook would otherwise leave a 404'd avatar silently unset, hard to distinguish from "no art yet".
    const probe = new Image();
    probe.onload = () => card.style.setProperty('--roblox-card-art', `url("${avatarUrl}")`);
    probe.src = avatarUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--roblox-card-art');
    };
  }, [data.profile.avatarUrl]);

  return (
    <div ref={overviewRef} className="roblox-overview space-y-4">
      <RobloxNowPlaying data={data} />
      <RobloxProfileStats data={data} />
      {showGames && (
        <section aria-label="Favorite games">
          <div className="roblox-shelf-heading">
            <p>Favorites</p>
          </div>
          <RobloxGames data={data} />
        </section>
      )}
    </div>
  );
}
