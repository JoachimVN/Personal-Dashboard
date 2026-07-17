import { useState } from 'react';
import type { SteamData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-steam)';

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

function Stat({ value, label }: Readonly<{ value: string | number; label: string }>) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
    </div>
  );
}

/* The whole overview card is one link (see SectionCard), so these components are
   display-only — no nested anchors. */

export function SteamNowPlaying({ data }: Readonly<{ data: SteamData }>) {
  const recent = data.recentlyPlayed[0];
  // Steam's "recently played" is a strict last-2-weeks window — someone with a big library but no
  // play in that window would otherwise see a blank card despite having plenty of history to show.
  const game = data.currentGame ?? recent ?? data.library?.mostPlayed[0];
  if (!game) return <p className="text-sm text-ink-faint">No recent Steam activity.</p>;
  const label = data.currentGame ? 'Playing now' : recent ? 'Last played' : 'Most played';
  return (
    <div className="flex gap-4">
      {game.headerUrl ? (
        <img src={game.headerUrl} alt="" className="h-20 w-36 shrink-0 rounded-xl object-cover shadow-lg" />
      ) : (
        <div className="h-20 w-36 shrink-0 rounded-xl bg-track" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
          {label}
        </p>
        <p className="mt-1 truncate text-lg font-semibold text-ink">{game.name}</p>
        {game.playtimeForeverMinutes !== undefined && (
          <p className="truncate text-sm text-ink-muted">{formatHours(game.playtimeForeverMinutes)} total playtime</p>
        )}
      </div>
    </div>
  );
}

export function SteamLibraryStats({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.library !== 'available' || !data.library) {
    return (
      <p className="text-sm text-ink-faint">
        {data.availability.library === 'private'
          ? 'Library is private — make "Game details" public in Steam privacy settings to see stats here.'
          : "Library data isn't available right now."}
      </p>
    );
  }
  const { totalGames, totalPlaytimeMinutes, recentPlaytimeMinutes } = data.library;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat value={totalGames} label="games owned" />
      <Stat value={formatHours(totalPlaytimeMinutes)} label="total hours" />
      <Stat value={formatHours(recentPlaytimeMinutes)} label="past 2 weeks" />
    </div>
  );
}

type SteamGameSort = 'total' | 'recent';

/** Full owned-games list, sortable by the only two windows Steam's API actually tracks —
 * all-time playtime and the trailing ~2-week window — rather than invented intermediate ranges. */
export function SteamGameList({ data }: Readonly<{ data: SteamData }>) {
  const [sort, setSort] = useState<SteamGameSort>('total');

  if (data.availability.library !== 'available' || !data.library) {
    return (
      <p className="text-sm text-ink-faint">
        {data.availability.library === 'private'
          ? 'Library is private — make "Game details" public in Steam privacy settings to see your games here.'
          : "Library data isn't available right now."}
      </p>
    );
  }
  if (data.library.allGames.length === 0) {
    return <p className="text-sm text-ink-faint">No games in this library yet.</p>;
  }

  const key = sort === 'total' ? 'playtimeForeverMinutes' : 'playtimeRecentMinutes';
  const games = [...data.library.allGames].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));

  return (
    <div>
      <fieldset className="steam-sort-toggle mb-3" aria-label="Sort by">
        <button type="button" data-active={sort === 'total'} onClick={() => setSort('total')}>
          All time
        </button>
        <button type="button" data-active={sort === 'recent'} onClick={() => setSort('recent')}>
          Last 2 weeks
        </button>
      </fieldset>
      <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1 text-sm">
        {games.map((game) => (
          <li
            key={game.appId}
            className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45"
          >
            {game.iconUrl ? (
              <img src={game.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
            )}
            <p className="min-w-0 flex-1 truncate font-medium text-ink">{game.name}</p>
            <span className="shrink-0 text-xs tabular-nums text-ink-faint">
              {formatHours(game.playtimeForeverMinutes ?? 0)} total
            </span>
            <span className="shrink-0 text-xs tabular-nums text-ink-faint">
              {formatHours(game.playtimeRecentMinutes ?? 0)} recent
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SteamRecentGames({ data }: Readonly<{ data: SteamData }>) {
  if (data.recentlyPlayed.length === 0) {
    return <p className="text-sm text-ink-faint">No recently played games.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {data.recentlyPlayed.map((game) => (
        <li
          key={game.appId}
          className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45"
        >
          {game.iconUrl ? (
            <img src={game.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{game.name}</p>
            {game.playtimeRecentMinutes !== undefined && (
              <p className="truncate text-xs text-ink-faint">{formatHours(game.playtimeRecentMinutes)} recently</p>
            )}
          </div>
          {game.playtimeForeverMinutes !== undefined && (
            <span className="shrink-0 text-xs text-ink-faint">{formatHours(game.playtimeForeverMinutes)} total</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SteamAchievementsWidget({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.achievements !== 'available' || !data.achievements) {
    return (
      <p className="text-sm text-ink-faint">
        No achievement data for the tracked game — it may be private, or the game may not support achievements.
      </p>
    );
  }
  const { gameName, unlockedCount, totalCount, recentUnlocks } = data.achievements;
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Tracked game</p>
          <p className="truncate text-base font-semibold text-ink">{gameName}</p>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-ink-muted">
          {unlockedCount}/{totalCount} · {pct}%
        </p>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
      </div>
      {recentUnlocks.length === 0 ? (
        <p className="text-sm text-ink-faint">No unlocked achievements yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {recentUnlocks.slice(0, 5).map((achievement) => (
            <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
              {achievement.iconUrl ? (
                <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                <p className="truncate text-xs text-ink-faint">
                  {relativeTime(achievement.unlockedAt)}
                  {achievement.globalUnlockedPercent !== undefined
                    ? ` · ${achievement.globalUnlockedPercent.toFixed(1)}% of players`
                    : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SteamFriendsWidget({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.friends !== 'available') {
    return (
      <p className="text-sm text-ink-faint">
        {data.availability.friends === 'private' ? 'Friends list is private.' : "Friends data isn't available right now."}
      </p>
    );
  }
  if (data.friendsInGame.length === 0) {
    return <p className="text-sm text-ink-faint">No friends currently in a game.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {data.friendsInGame.map((friend) => (
        <li key={friend.steamId} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
          {friend.avatarUrl ? (
            <img src={friend.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-track" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{friend.personaName}</p>
            <p className="truncate text-xs text-ink-faint">{friend.gameName}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
