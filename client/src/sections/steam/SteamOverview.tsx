import { useEffect, useRef } from 'react';
import type { SteamAchievement, SteamData, SteamGame } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { SteamPlaytimeTrend } from '../../widgets/SteamWidgets';
import './steam.css';

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

function Metric({ value, label, detail }: Readonly<{ value: string | number; label: string; detail?: string }>) {
  return (
    <div className="steam-home-metric">
      <p className="steam-home-metric-value">{value}</p>
      <p className="steam-home-metric-label">{label}</p>
      {detail && <p className="steam-home-metric-detail">{detail}</p>}
    </div>
  );
}

type ShelfEntry = { game: SteamGame; source: 'recent' | 'all-time' };

function ShelfGame({ entry }: Readonly<{ entry: ShelfEntry }>) {
  const playtime = entry.source === 'recent' ? entry.game.playtimeRecentMinutes : entry.game.playtimeForeverMinutes;
  return (
    <article className="steam-shelf-game">
      {entry.game.headerUrl ? <img aria-hidden src={entry.game.headerUrl} alt="" loading="lazy" /> : <div className="steam-shelf-game-fallback" />}
      <div className="steam-shelf-game-scrim" />
      <div className="steam-shelf-game-copy">
        <p className="truncate text-sm font-semibold text-white">{entry.game.name}</p>
        {playtime !== undefined && <p className="mt-0.5 text-[10px] tabular-nums text-white/70">{formatHours(playtime)} {entry.source === 'recent' ? 'recent' : 'all time'}</p>}
      </div>
    </article>
  );
}

function AchievementUnlock({ achievement }: Readonly<{ achievement: SteamAchievement }>) {
  const unlockedOn = new Date(achievement.unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <li className="steam-home-unlock">
      {achievement.iconUrl ? <img src={achievement.iconUrl} alt="" loading="lazy" /> : <span aria-hidden className="steam-home-unlock-fallback">★</span>}
      <span className="min-w-0 flex-1 truncate">{achievement.displayName}</span>
      <time dateTime={achievement.unlockedAt}>{unlockedOn}</time>
    </li>
  );
}

function SteamHomeDashboard({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.library !== 'available' || !data.library) return null;

  const recentGames = [...data.recentlyPlayed].sort((a, b) => (b.playtimeRecentMinutes ?? 0) - (a.playtimeRecentMinutes ?? 0));
  const recentIds = new Set(recentGames.map((game) => game.appId));
  const shelf: ShelfEntry[] = [
    ...recentGames.map((game) => ({ game, source: 'recent' as const })),
    ...data.library.mostPlayed.filter((game) => !recentIds.has(game.appId)).map((game) => ({ game, source: 'all-time' as const })),
  ].slice(0, 3);
  const { totalGames, totalPlaytimeMinutes, recentPlaytimeMinutes } = data.library;
  const achievementPct = data.achievements && data.achievements.totalCount > 0
    ? Math.round((data.achievements.unlockedCount / data.achievements.totalCount) * 100)
    : undefined;

  return (
    <div className="steam-home-dashboard">
      <section className="steam-home-pulse" aria-label="Steam library summary">
        <div className="steam-home-section-heading">
          <p>Library pulse</p>
          <span>{recentPlaytimeMinutes > 0 ? `${formatHours(recentPlaytimeMinutes)} this fortnight` : 'Quiet lately'}</span>
        </div>
        <div className="steam-home-metrics">
          <Metric value={totalGames} label="games owned" />
          <Metric value={formatHours(totalPlaytimeMinutes)} label="hours played" />
          <Metric value={recentPlaytimeMinutes > 0 ? formatHours(recentPlaytimeMinutes) : '—'} label="past 2 weeks" detail={recentPlaytimeMinutes > 0 ? 'Steam activity' : 'No recent sessions'} />
        </div>
        {data.achievements && achievementPct !== undefined && (
          <div className="steam-home-achievement-panel">
            <div className="steam-home-achievement">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Achievement progress</p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{data.achievements.gameName}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{achievementPct}%</p>
              <div className="steam-home-achievement-track" aria-hidden>
                <span style={{ width: `${achievementPct}%` }} />
              </div>
            </div>
            {data.achievements.recentUnlocks.length > 0 && (
              <ul className="steam-home-unlocks" aria-label="Latest achievements">
                {data.achievements.recentUnlocks.slice(0, 3).map((achievement) => <AchievementUnlock key={achievement.apiName} achievement={achievement} />)}
              </ul>
            )}
          </div>
        )}
      </section>

      {shelf.length > 0 && (
        <section className="steam-home-shelf" aria-label="Top three Steam games">
          <div className="steam-home-section-heading">
            <p>Top 3</p>
            <span>{shelf.some((entry) => entry.source === 'all-time') ? 'Recent + all-time' : 'Last 2 weeks'}</span>
          </div>
          <div className="steam-shelf-grid">
            {shelf.map((entry) => <ShelfGame key={entry.game.appId} entry={entry} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function SteamOverview() {
  const { envelope, offline } = useWidget<SteamData>('steam');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => <SteamOverviewContent data={data} />}
    </WidgetBody>
  );
}

function SteamOverviewContent({ data }: Readonly<{ data: SteamData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const recent = [...data.recentlyPlayed].sort((a, b) => (b.playtimeRecentMinutes ?? 0) - (a.playtimeRecentMinutes ?? 0))[0];
  const featured = data.currentGame ?? recent ?? data.library?.mostPlayed[0];

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--steam');
    if (!card) return undefined;
    if (featured?.headerUrl) card.style.setProperty('--steam-card-art', `url("${featured.headerUrl}")`);
    else card.style.removeProperty('--steam-card-art');
    return () => {
      card.style.removeProperty('--steam-card-art');
    };
  }, [featured?.headerUrl]);

  return (
    <div ref={overviewRef} className="steam-overview space-y-4">
      <SteamHomeDashboard data={data} />
      {data.playtimeHistory.length > 1 && <SteamPlaytimeTrend data={data} />}
    </div>
  );
}
