import type { SteamData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import {
  SteamAchievementShowcase,
  SteamAchievementsWidget,
  SteamFriendsLeaderboard,
  SteamFriendsWidget,
  SteamGameList,
  SteamLibraryStats,
  SteamNowPlaying,
  SteamPlaytimeTrend,
  SteamRecentGames,
} from '../../widgets/SteamWidgets';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './steam.css';

function SteamSignals() {
  const { envelope, offline } = useWidget<SteamData>('steam');
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
                <p className="truncate text-sm font-semibold text-ink">{data.profile.personaName}</p>
                <a
                  href={data.profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-ink-faint hover:underline"
                >
                  View Steam profile
                </a>
              </div>
            </div>
            <SteamLibraryStats data={data} />
          </div>
        )}
      </WidgetBody>
    </div>
  );
}

export function SteamDetail() {
  const { envelope, offline } = useWidget<SteamData>('steam');

  return (
    <div>
      <DetailIntro
        eyebrow="Games"
        title={
          <>
            What you&apos;re
            <br />
            <span className="text-ink-faint">playing on Steam.</span>
          </>
        }
        description="Your current game, library totals, and achievement progress for whichever game is tracked right now."
        accent="var(--color-accent-steam)"
      >
        <SteamSignals />
      </DetailIntro>

      <DetailSectionHeading label="Now" title="Current game" />
      {/* Neutral title — SteamNowPlaying's own kicker ("Playing now"/"Last played"/"Most played") states the actual status. */}
      <WidgetShell title="Game">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamNowPlaying data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading
        label="Trends"
        title="Playtime over time"
        detail="Daily deltas between library snapshots — Steam only reports a cumulative all-time total, not a native day-by-day breakdown."
      />
      <WidgetShell title="Playtime">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamPlaytimeTrend data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading
        label="Library"
        title="Recently played and achievements"
        detail="Achievement progress tracks the current game, or the most recently played one when you're not in-game."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WidgetShell title="Recently played">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamRecentGames data={data} />}
          </WidgetBody>
        </WidgetShell>
        <WidgetShell title="Achievements">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamAchievementsWidget data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <DetailSectionHeading
        label="Achievements"
        title="Tracked game highlights"
        detail="Rarest unlocks and the achievements you're closest to in your current or most recently played game, ranked by Steam's global unlock rate."
      />
      <WidgetShell title="Achievement highlights">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamAchievementShowcase data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading
        label="Friends"
        title="Playtime leaderboard"
        detail="Ranked by all-time playtime across your Steam friends; private libraries stay listed, just unranked."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WidgetShell title="Leaderboard">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamFriendsLeaderboard data={data} />}
          </WidgetBody>
        </WidgetShell>
        <WidgetShell title="Playing now">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamFriendsWidget data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <DetailSectionHeading
        label="Library"
        title="All your games"
        detail="Sorted by all-time or last-2-weeks playtime — the only two windows Steam's API tracks."
      />
      <WidgetShell title="Games">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamGameList data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
