import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SteamData, SteamGame } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-steam)';

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Rarity tier for a global-unlock percent, echoed as both text and color — never color alone. */
function rarityTier(percent: number): { label: string; color: string } {
  if (percent < 5) return { label: 'Ultra rare', color: 'light-dark(#a3195b, #ff5da8)' };
  if (percent < 15) return { label: 'Rare', color: 'light-dark(#7c3aed, #c4b5fd)' };
  if (percent < 35) return { label: 'Uncommon', color: 'light-dark(#0e7490, #22d3ee)' };
  return { label: 'Common', color: 'var(--color-ink-faint)' };
}

function Stat({ value, label }: Readonly<{ value: string | number; label: string }>) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
    </div>
  );
}

/** Steam's owned-games endpoint gives every game a derived header URL, but older/delisted apps
 * can still return 404. Fall back to the square Steam icon, then a stable initial tile. */
function SteamGameArtwork({ game }: Readonly<{ game: SteamGame }>) {
  const [headerFailed, setHeaderFailed] = useState(false);
  const hasHeader = Boolean(game.headerUrl) && !headerFailed;
  const fallbackInitial = game.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      {hasHeader && (
        <img
          aria-hidden
          data-steam-header={game.headerUrl}
          alt=""
          className="steam-game-row-backdrop"
          decoding="async"
          onError={() => setHeaderFailed(true)}
        />
      )}
      {hasHeader ? (
        <img
          data-steam-header={game.headerUrl}
          alt=""
          className="steam-game-cover"
          decoding="async"
          onError={() => setHeaderFailed(true)}
        />
      ) : game.iconUrl ? (
        <img src={game.iconUrl} alt="" className="steam-game-cover steam-game-cover--icon" loading="lazy" decoding="async" />
      ) : (
        <div aria-hidden className="steam-game-cover steam-game-cover--fallback">{fallbackInitial}</div>
      )}
    </>
  );
}

/* The whole overview card is one link (see SectionCard), so these components are
   display-only — no nested anchors. */

export function SteamNowPlaying({ data }: Readonly<{ data: SteamData }>) {
  const recent = [...data.recentlyPlayed].sort((a, b) => (b.playtimeRecentMinutes ?? 0) - (a.playtimeRecentMinutes ?? 0))[0];
  // Steam's "recently played" is a strict last-2-weeks window — someone with a big library but no
  // play in that window would otherwise see a blank card despite having plenty of history to show.
  const game = data.currentGame ?? recent ?? data.library?.mostPlayed[0];
  if (!game) return <p className="text-sm text-ink-faint">No recent Steam activity.</p>;
  const label = data.currentGame ? 'Playing now' : recent ? 'Top played recently' : 'All-time favourite';
  return (
    <div className="steam-hero p-4 sm:p-5">
      {game.headerUrl && <img aria-hidden src={game.headerUrl} alt="" className="steam-hero-backdrop" />}
      <div className="steam-hero-scrim" />
      <div className="relative flex items-center gap-4">
        {game.headerUrl ? (
          <img src={game.headerUrl} alt="" className="h-20 w-32 shrink-0 rounded-xl object-cover shadow-lg sm:h-24 sm:w-40" />
        ) : (
          <div className="h-20 w-32 shrink-0 rounded-xl bg-track sm:h-24 sm:w-40" />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center gap-2">
            {data.currentGame && <span aria-hidden className="steam-live-dot" />}
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>{label}</p>
          </div>
          <p className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">{game.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
            {game.playtimeForeverMinutes !== undefined && <span>{formatHours(game.playtimeForeverMinutes)} in library</span>}
            {game.playtimeRecentMinutes !== undefined && game.playtimeRecentMinutes > 0 && (
              <span className="text-ink">{formatHours(game.playtimeRecentMinutes)} this fortnight</span>
            )}
          </div>
        </div>
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
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query, sort]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const loadArtwork = (row: Element) => {
      row.querySelectorAll<HTMLImageElement>('img[data-steam-header]').forEach((image) => {
        const src = image.dataset.steamHeader;
        if (!src || image.hasAttribute('src')) return;
        image.fetchPriority = 'high';
        image.src = src;
      });
    };
    const rows = Array.from(list.children);
    if (!('IntersectionObserver' in window)) {
      rows.forEach(loadArtwork);
      return undefined;
    }

    // Keep several screens of the scroll container warm in both directions so decoded Steam
    // headers are ready before a fast wheel or trackpad scroll brings their rows into view.
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadArtwork(entry.target);
        observer.unobserve(entry.target);
      }),
      { root: list, rootMargin: '1200px 0px' },
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [data.library, query, sort]);

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
  const games = [...data.library.allGames]
    .filter((game) => game.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));

  return (
    <div>
      <div className="steam-library-toolbar">
        <label className="steam-game-search">
          <span className="sr-only">Search your games</span>
          <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" />
          </svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" />
        </label>
        <fieldset className="steam-sort-toggle" aria-label="Sort by">
          <button type="button" data-active={sort === 'total'} onClick={() => setSort('total')}>All time</button>
          <button type="button" data-active={sort === 'recent'} onClick={() => setSort('recent')}>Last 2 weeks</button>
        </fieldset>
      </div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-xs text-ink-faint">{games.length === data.library.allGames.length ? `${games.length} games` : `${games.length} matching games`}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {sort === 'total' ? 'Hours in library' : 'Recent activity'}
        </p>
      </div>
      {games.length === 0 ? (
        <p className="rounded-2xl bg-track/25 px-4 py-5 text-sm text-ink-faint">No games match that search.</p>
      ) : (
        <ol
          ref={listRef}
          className="steam-game-list max-h-[42rem] overflow-y-auto pr-1"
        >
          {games.map((game, index) => {
            const primaryMinutes = sort === 'total' ? game.playtimeForeverMinutes : game.playtimeRecentMinutes;
            const secondaryMinutes = sort === 'total' ? game.playtimeRecentMinutes : game.playtimeForeverMinutes;
            return (
              <li key={game.appId} className="steam-game-row" data-recent={(game.playtimeRecentMinutes ?? 0) > 0}>
                <span className="steam-game-rank">{index + 1}</span>
                <SteamGameArtwork game={game} />
                <div className="relative min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{game.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                    {secondaryMinutes && secondaryMinutes > 0
                      ? `${formatHours(secondaryMinutes)} ${sort === 'total' ? 'in the last 2 weeks' : 'in library'}`
                      : sort === 'recent' ? 'No activity in the last 2 weeks' : 'No recent activity'}
                  </p>
                </div>
                <div className="relative shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatHours(primaryMinutes ?? 0)}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                    {sort === 'total' ? 'total' : 'recent'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
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

const PLAYTIME_TREND_WINDOW_DAYS = 30;

interface PlaytimeSlot {
  date: string;
  hours: number;
}

/** Steam only reports cumulative all-time playtime, day-granularity — the trend chart derives
 * day-over-day deltas from consecutive samples rather than a native per-day breakdown. Clamped at
 * 0 so a cache/library correction never renders as negative playtime. */
function buildPlaytimeSlots(history: SteamData['playtimeHistory'], windowDays: number): PlaytimeSlot[] {
  const recent = history.slice(-(windowDays + 1));
  const slots: PlaytimeSlot[] = [];
  for (let i = 1; i < recent.length; i++) {
    const delta = recent[i].totalPlaytimeMinutes - recent[i - 1].totalPlaytimeMinutes;
    slots.push({ date: recent[i].date, hours: Math.max(delta, 0) / 60 });
  }
  return slots;
}

const trendDateFmt = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Daily playtime bars over the trailing month, derived from cumulative history samples. */
export function SteamPlaytimeTrend({ data }: Readonly<{ data: SteamData }>) {
  const [active, setActive] = useState<number | null>(null);
  const slots = buildPlaytimeSlots(data.playtimeHistory, PLAYTIME_TREND_WINDOW_DAYS);
  if (slots.length === 0) {
    return <p className="text-sm text-ink-faint">Trends unlock once a couple of days have synced.</p>;
  }
  const max = Math.max(...slots.map((s) => s.hours), 1);
  const totalHours = slots.reduce((sum, s) => sum + s.hours, 0);
  const readout =
    active != null ? `${slots[active].hours.toFixed(1)}h · ${trendDateFmt(slots[active].date)}` : `${totalHours.toFixed(1)}h total · last ${slots.length} days`;

  return (
    <div>
      <div
        className="flex h-24 items-end gap-0.5"
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null);
        }}
      >
        {slots.map((slot, i) => (
          <div
            key={slot.date}
            className="flex h-full flex-1 cursor-pointer items-end"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
          >
            {slot.hours > 0 && (
              <div
                className="w-full rounded-t-[2px] transition-opacity"
                style={{ height: `${Math.max((slot.hours / max) * 100, 3)}%`, background: accent, opacity: active === i ? 1 : 0.7 }}
                aria-label={`${slot.date}: ${slot.hours.toFixed(1)}h`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] tabular-nums text-ink-muted">{readout}</p>
        <p className="shrink-0 text-[9px] text-ink-faint">
          {trendDateFmt(slots[0].date)} – {trendDateFmt(slots.at(-1)!.date)}
        </p>
      </div>
    </div>
  );
}

/** Rarest unlocked achievements plus the "most other players have this, you don't yet" locked
 * showcase — both computed server-side from Steam's global unlock-rate data. */
export function SteamAchievementShowcase({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.achievements !== 'available' || !data.achievements) {
    return <p className="text-sm text-ink-faint">No achievement highlights for the tracked game right now.</p>;
  }
  const { gameName, rarest, nextEasiest } = data.achievements;
  if (rarest.length === 0 && nextEasiest.length === 0) {
    return <p className="text-sm text-ink-faint">No global rarity data for this game's achievements yet.</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-faint">
        Tracking <span className="font-medium text-ink-muted">{gameName}</span>
      </p>
      {rarest.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Rarest unlocks</p>
          <ul className="space-y-2 text-sm">
            {rarest.map((achievement) => {
              const tier = rarityTier(achievement.globalUnlockedPercent!);
              return (
                <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
                  {achievement.iconUrl ? (
                    <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tier.color }} />
                      {tier.label} · {achievement.globalUnlockedPercent!.toFixed(1)}% of players
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {nextEasiest.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Next easiest</p>
          <ul className="space-y-2 text-sm">
            {nextEasiest.map((achievement) => (
              <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 opacity-70">
                {achievement.iconUrl ? (
                  <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover grayscale" />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {achievement.globalUnlockedPercent!.toFixed(1)}% of players have this
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type SteamLeaderboardPeriod = 'total' | 'recent';

/** Ranked by all-time or trailing-two-week playtime; friends with private libraries remain
 * visible (name only) rather than being silently dropped from the list. */
export function SteamFriendsLeaderboard({ data }: Readonly<{ data: SteamData }>) {
  const [period, setPeriod] = useState<SteamLeaderboardPeriod>('total');
  const { status, entries } = data.friendsLeaderboard;
  if (status !== 'available') {
    return <p className="text-sm text-ink-faint">Friends leaderboard isn&apos;t available right now.</p>;
  }
  if (entries.length <= 1) {
    return <p className="text-sm text-ink-faint">Add Steam friends to see a playtime leaderboard.</p>;
  }
  const metric = period === 'total' ? 'totalPlaytimeMinutes' : 'recentPlaytimeMinutes';
  const ranked = entries
    .filter((entry) => entry[metric] !== undefined)
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const unranked = entries.filter((entry) => entry[metric] === undefined);
  const max = Math.max(...ranked.map((entry) => entry[metric] ?? 0), 1);

  return (
    <div>
      <fieldset className="steam-leaderboard-period steam-sort-toggle" aria-label="Playtime period">
        <button type="button" data-active={period === 'total'} onClick={() => setPeriod('total')}>All time</button>
        <button type="button" data-active={period === 'recent'} onClick={() => setPeriod('recent')}>Last 2 weeks</button>
      </fieldset>
      <ol className="space-y-1.5">
        {ranked.map((entry, i) => (
          <li
            key={entry.steamId}
            className="steam-leaderboard-row"
            data-you={entry.isYou}
            style={{ '--fill': `${((entry[metric] ?? 0) / max) * 100}%` } as CSSProperties}
          >
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
            {entry.avatarUrl ? (
              <img src={entry.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 shrink-0 rounded-full bg-track" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {entry.isYou ? 'You' : entry.personaName}
            </span>
            {entry.sharedGames > 0 && (
              <span className="shrink-0 text-[10px] text-ink-faint">{entry.sharedGames} shared</span>
            )}
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">{formatHours(entry[metric] ?? 0)}</span>
          </li>
        ))}
      </ol>
      {unranked.length > 0 && (
        <ul className="mt-3 space-y-1 opacity-50">
          {unranked.map((entry) => (
            <li key={entry.steamId} className="flex items-center gap-3 px-1 py-1 text-xs text-ink-faint">
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="h-5 w-5 shrink-0 rounded-full bg-track" />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.personaName}</span>
              <span className="shrink-0">library private</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
