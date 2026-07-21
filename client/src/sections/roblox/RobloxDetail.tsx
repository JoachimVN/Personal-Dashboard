import type { RobloxData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { RobloxBadges, RobloxGames, RobloxNowPlaying, RobloxProfileStats } from '../../widgets/RobloxWidgets';
import { DetailSectionHeading } from '../DetailIntro';

export function RobloxSignals() {
  const { envelope, offline } = useWidget<RobloxData>('roblox');
  return (
    <div className="detail-signal-panel">
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {data.profile.avatarUrl ? (
                <img src={data.profile.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-track" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{data.profile.displayName}</p>
                <a
                  href={`https://www.roblox.com/users/${data.profile.userId}/profile`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-ink-faint hover:underline"
                >
                  View Roblox profile
                </a>
              </div>
            </div>
            <RobloxProfileStats data={data} />
          </div>
        )}
      </WidgetBody>
    </div>
  );
}

export function RobloxDetail() {
  const { envelope, offline } = useWidget<RobloxData>('roblox');

  return (
    <div>
      <DetailSectionHeading label="Now" title="Presence" />
      <WidgetShell title="Status">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <RobloxNowPlaying data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Badges" title="Recently earned badges" />
      <WidgetShell title="Badges">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <RobloxBadges data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading
        label="Games"
        title="Created and favorited games"
        detail="Favorites require the session cookie; created games are public."
      />
      <WidgetShell title="Games">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <RobloxGames data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
