import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SteamData, SteamGame } from '@personal-dashboard/shared';
import { formatHours } from './shared';

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

  let cover: ReactNode;
  if (hasHeader) {
    cover = (
      <img
        data-steam-header={game.headerUrl}
        alt=""
        className="steam-game-cover"
        decoding="async"
        onError={() => setHeaderFailed(true)}
      />
    );
  } else if (game.iconUrl) {
    cover = <img src={game.iconUrl} alt="" className="steam-game-cover steam-game-cover--icon" loading="lazy" decoding="async" />;
  } else {
    cover = <div aria-hidden className="steam-game-cover steam-game-cover--fallback">{fallbackInitial}</div>;
  }

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
      {cover}
    </>
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
            let secondaryLabel: string;
            if (secondaryMinutes && secondaryMinutes > 0) {
              secondaryLabel = `${formatHours(secondaryMinutes)} ${sort === 'total' ? 'in the last 2 weeks' : 'in library'}`;
            } else if (sort === 'recent') {
              secondaryLabel = 'No activity in the last 2 weeks';
            } else {
              secondaryLabel = 'No recent activity';
            }
            return (
              <li key={game.appId} className="steam-game-row" data-recent={(game.playtimeRecentMinutes ?? 0) > 0}>
                <span className="steam-game-rank">{index + 1}</span>
                <SteamGameArtwork game={game} />
                <div className="relative min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{game.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-muted">{secondaryLabel}</p>
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
