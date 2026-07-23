import { useEffect, useRef, useState } from 'react';
import type { SteamAchievement, SteamData, SteamGame } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import './steam.css';

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Same ring language as the weather overview's humidity gauge — a stroke-dasharray circle
 * reads faster at this size than the flat progress bar it replaces. */
function AchievementRing({ pct }: Readonly<{ pct: number }>) {
  const r = 15;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="steam-pulse-ring-svg -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-track)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--color-accent-steam)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct / 100)}
      />
    </svg>
  );
}

function AchievementBadge({ achievement }: Readonly<{ achievement: SteamAchievement }>) {
  return (
    <li className="steam-pulse-badge">
      {achievement.iconUrl ? (
        <img src={achievement.iconUrl} alt="" loading="lazy" />
      ) : (
        <span aria-hidden className="steam-pulse-badge-fallback">★</span>
      )}
      <div className="min-w-0">
        <p className="steam-pulse-badge-name">{achievement.displayName}</p>
        <p className="steam-pulse-badge-date">{relativeTime(achievement.unlockedAt)}</p>
      </div>
    </li>
  );
}

type ShelfEntry = { game: SteamGame; source: 'recent' | 'all-time' };

function ShelfGame({ entry }: Readonly<{ entry: ShelfEntry }>) {
  const playtime = entry.source === 'recent' ? entry.game.playtimeRecentMinutes : entry.game.playtimeForeverMinutes;
  const [headerFailed, setHeaderFailed] = useState(false);
  const hasHeader = Boolean(entry.game.headerUrl) && !headerFailed;
  return (
    <article className="steam-shelf-game">
      {hasHeader ? (
        <img aria-hidden src={entry.game.headerUrl} alt="" loading="lazy" onError={() => setHeaderFailed(true)} />
      ) : (
        <div className="steam-shelf-game-fallback" />
      )}
      <div className="steam-shelf-game-scrim" />
      <div className="steam-shelf-game-copy">
        <p className="truncate text-sm font-semibold text-white">{entry.game.name}</p>
        {playtime !== undefined && <p className="mt-0.5 text-[10px] tabular-nums text-white/70">{formatHours(playtime)} {entry.source === 'recent' ? 'recent' : 'all time'}</p>}
      </div>
    </article>
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
  const recentUnlocks = data.achievements?.recentUnlocks.slice(0, 3) ?? [];

  return (
    <div className="steam-home-dashboard">
      <section className="steam-pulse" aria-label="Steam library summary">
        {data.achievements && achievementPct !== undefined && (
          <div className="steam-pulse-top">
            <AchievementRing pct={achievementPct} />
            <div className="steam-pulse-top-copy">
              <span className="steam-eyebrow">Achievement progress</span>
              <p className="steam-pulse-game">{data.achievements.gameName}</p>
            </div>
            <p className="steam-pulse-pct">{achievementPct}%</p>
          </div>
        )}

        <div className="steam-pulse-stats">
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{totalGames}</p>
            <p className="steam-pulse-stat-label">games owned</p>
          </div>
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{formatHours(totalPlaytimeMinutes)}</p>
            <p className="steam-pulse-stat-label">hours played</p>
          </div>
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{recentPlaytimeMinutes > 0 ? formatHours(recentPlaytimeMinutes) : '—'}</p>
            <p className="steam-pulse-stat-label">past 2 weeks</p>
          </div>
        </div>

        {recentUnlocks.length > 0 && (
          <ul className="steam-pulse-badges" aria-label="Latest achievements">
            {recentUnlocks.map((achievement) => <AchievementBadge key={achievement.apiName} achievement={achievement} />)}
          </ul>
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
    const headerUrl = featured?.headerUrl;
    if (!headerUrl) {
      card.style.removeProperty('--steam-card-art');
      return undefined;
    }
    // Probe the image before wiring it into the background — a bare CSS url() with no onload/onerror
    // hook would otherwise leave a 404'd header silently unset, hard to distinguish from "no art yet".
    const probe = new Image();
    probe.onload = () => card.style.setProperty('--steam-card-art', `url("${headerUrl}")`);
    probe.src = headerUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--steam-card-art');
    };
  }, [featured?.headerUrl]);

  return (
    <div ref={overviewRef} className="steam-overview space-y-4">
      <SteamHomeDashboard data={data} />
    </div>
  );
}
