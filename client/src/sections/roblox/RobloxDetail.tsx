import type { RobloxData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { RobloxBadges, RobloxGames, RobloxNowPlaying, RobloxProfileStats } from '../../widgets/RobloxWidgets';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './roblox.css';

/** Roblox's join date has no native "years on the platform" framing anywhere in their own UI,
 * so this derives one from the raw date the same way a birthday would be computed. */
function accountAgeYears(joinedAt: string): number {
  const joined = new Date(joinedAt);
  const now = new Date();
  let years = now.getFullYear() - joined.getFullYear();
  const beforeAnniversary = now.getMonth() < joined.getMonth() || (now.getMonth() === joined.getMonth() && now.getDate() < joined.getDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

function RobloxSignals() {
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
            {data.profile.joinedAt && (
              <p className="text-xs text-ink-faint">
                On Roblox for {accountAgeYears(data.profile.joinedAt)} years — joined{' '}
                {new Date(data.profile.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
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
      <DetailIntro
        title="Roblox activity"
        description="Your current presence, recently earned badges, and your favorite games."
        accent="var(--color-accent-roblox)"
      >
        <RobloxSignals />
      </DetailIntro>

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

      <DetailSectionHeading label="Games" title="Favorite games" detail="Requires the Roblox session cookie." />
      <WidgetShell title="Favorites">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <RobloxGames data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
