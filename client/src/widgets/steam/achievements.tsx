import { useState } from 'react';
import type { SteamAchievement, SteamData, SteamLockedAchievement } from '@personal-dashboard/shared';
import { relativeTime } from '../../lib/time';
import { accent, findTrackedGame, useArtFallback } from './shared';

/** Rarity tier for a global-unlock percent, echoed as both text and color — never color alone. */
export function rarityTier(percent: number): { label: string; color: string } {
  if (percent < 5) return { label: 'Ultra rare', color: 'light-dark(#a3195b, #ff5da8)' };
  if (percent < 15) return { label: 'Rare', color: 'light-dark(#7c3aed, #c4b5fd)' };
  if (percent < 35) return { label: 'Uncommon', color: 'light-dark(#0e7490, #22d3ee)' };
  return { label: 'Common', color: 'var(--color-ink-faint)' };
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

/** Header art for the tracked game — looked up by appId across the payload's game lists, since
 * achievements only carry the id/name, not art. Falls back to a plain fill if art 404s or the
 * game isn't in any list the client already has (shouldn't happen, but art is never load-bearing).
 *
 * Carries the progress readout too, rather than leaving it to a row underneath: the two belong to
 * the same subject, and naming the game twice in adjacent blocks was pure repetition. */
function TrackedGameBanner({ data, appId, gameName, progress }: Readonly<{
  data: SteamData;
  appId: number;
  gameName: string;
  progress?: { unlockedCount: number; totalCount: number; pct: number };
}>) {
  const game = findTrackedGame(data, appId);
  const art = useArtFallback([game?.headerUrl, game?.heroUrl]);
  const hasArt = Boolean(art.src);
  return (
    <div className="steam-tracking-banner">
      {hasArt && (
        <img aria-hidden src={art.src} alt="" className="steam-tracking-banner-backdrop" />
      )}
      <div className="steam-tracking-banner-scrim" />
      <div className="relative flex items-center gap-3">
        {hasArt ? (
          <img src={art.src} alt="" className="steam-tracking-banner-thumb" onError={art.onError} />
        ) : (
          <div aria-hidden className="steam-tracking-banner-thumb steam-tracking-banner-thumb--fallback" />
        )}
        <div className="min-w-0 flex-1">
          <p className="steam-eyebrow">Tracking</p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-ink">{gameName}</p>
            {progress && (
              <p className="shrink-0 text-xs tabular-nums text-ink-muted">
                {progress.unlockedCount}/{progress.totalCount} · {progress.pct}%
              </p>
            )}
          </div>
          {progress && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: accent }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Easiest (highest global unlock %) first, the order Steam's own global achievement stats use:
 * what nearly everyone has at the top, what almost nobody does at the bottom. Achievements Steam
 * has no rarity data for yet sort last rather than being dropped, since this list is meant to be
 * the complete set, not a showcase. */
function sortByRarity<T extends { globalUnlockedPercent?: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.globalUnlockedPercent === undefined) return b.globalUnlockedPercent === undefined ? 0 : 1;
    if (b.globalUnlockedPercent === undefined) return -1;
    return b.globalUnlockedPercent - a.globalUnlockedPercent;
  });
}

/** When an achievement was unlocked, to the minute: "12 Mar, 14:32", gaining the year once it isn't
 * this one, matching the same-year convention `formatEventDate` uses. Its own formatter because that
 * helper always leads with a weekday, which is noise on a list where the day of week means nothing.
 * Steam reports unlock times to the second, so the clock time here is real rather than a rounded
 * stand-in for the date. */
function unlockStamp(iso: string): string {
  const parsed = new Date(iso);
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  const date = parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${date}, ${parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** The rarity/percent line's text — pulled out of the row so the percent-suffix choice isn't a
 * ternary nested inside the "do we even have a percent" ternary. */
function rarityDetail(achievement: SteamAchievement | SteamLockedAchievement, locked: boolean): string {
  if (achievement.globalUnlockedPercent === undefined) return 'Rarity unknown';
  const suffix = locked ? ' have this' : '';
  return `${achievement.globalUnlockedPercent.toFixed(1)}% of players${suffix}`;
}

type AchievementView = 'rarity' | 'date';

/** Whichever number explains the ordering currently on screen: the date view is sorted by when you
 * unlocked it, so it says that, and the rarity view says the percentage it sorted on. A locked
 * achievement has no unlock date to show by definition, so it keeps the rarity line in both views
 * rather than rendering an empty second line. */
function AchievementRow({ achievement, locked, view }: Readonly<{
  achievement: SteamAchievement | SteamLockedAchievement;
  locked: boolean;
  view: AchievementView;
}>) {
  const tier = achievement.globalUnlockedPercent !== undefined ? rarityTier(achievement.globalUnlockedPercent) : undefined;
  const datedUnlock = !locked && view === 'date' && 'unlockedAt' in achievement ? achievement.unlockedAt : undefined;
  return (
    <li className={`flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2${locked ? ' opacity-70' : ''}`}>
      {achievement.iconUrl ? (
        <img src={achievement.iconUrl} alt="" className={`h-8 w-8 shrink-0 rounded-md object-cover${locked ? ' grayscale' : ''}`} />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{achievement.displayName}</p>
        {datedUnlock ? (
          <p className="truncate text-xs text-ink-faint">Unlocked {unlockStamp(datedUnlock)}</p>
        ) : (
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
            {tier && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tier.color }} />}
            {tier ? `${tier.label} · ` : ''}
            {rarityDetail(achievement, locked)}
          </p>
        )}
      </div>
    </li>
  );
}

interface AchievementRowData {
  achievement: SteamAchievement | SteamLockedAchievement;
  locked: boolean;
}

/**
 * One list holding both states, ordered by whatever the current view sorts on.
 *
 * By rarity that means genuinely interleaved: a locked achievement sits between two unlocked ones
 * whenever its global percentage falls between theirs, which is the whole point of the view. Split
 * into "unlocked" and "missing" blocks it would only ever be two rarity ladders side by side, and
 * you could no longer read one ranking of the game's achievements by difficulty.
 *
 * By date the split happens on its own, without a heading having to announce it: every unlocked
 * achievement has a date to sort on and no locked one does, so the locked ones fall to the bottom.
 * They keep a rarity order among themselves, since it is the only thing left to rank them by.
 */
function achievementRows(
  unlocked: SteamAchievement[],
  locked: SteamLockedAchievement[],
  view: AchievementView,
): AchievementRowData[] {
  const lockedRows: AchievementRowData[] = sortByRarity(locked).map((achievement) => ({ achievement, locked: true }));
  if (view === 'date') {
    // recentUnlocks arrives newest-first from the server, which is exactly this view's order.
    return [...unlocked.map((achievement) => ({ achievement, locked: false })), ...lockedRows];
  }
  const all: AchievementRowData[] = [
    ...unlocked.map((achievement) => ({ achievement, locked: false })),
    ...locked.map((achievement) => ({ achievement, locked: true })),
  ];
  return sortByRarity(all.map((row) => ({ ...row, globalUnlockedPercent: row.achievement.globalUnlockedPercent })));
}

/** The two extremes worth pulling out of a long list: the rarest thing you own, and the easiest
 * thing you don't. A fully-completed game has no second half to show, so it gets the win instead. */
function AchievementSummary({ rarest, nextEasiest, missingCount }: Readonly<{
  rarest: SteamAchievement | undefined;
  nextEasiest: SteamLockedAchievement | undefined;
  missingCount: number;
}>) {
  if (missingCount === 0) {
    return <p className="steam-achievement-summary steam-achievement-summary--complete">Completed · every achievement unlocked</p>;
  }
  if (!rarest && !nextEasiest) return null;
  return (
    <div className="steam-achievement-summary-grid">
      {rarest && (
        <p>
          <span className="steam-eyebrow">Rarest unlock</span>
          <span className="truncate text-ink">{rarest.displayName}</span>
          <span className="text-ink-faint">{rarest.globalUnlockedPercent!.toFixed(1)}% of players</span>
        </p>
      )}
      {nextEasiest && (
        <p>
          {/* Not "closest to get": Steam's per-achievement progress counters ("49/50") come from
              GetUserStatsForGame, which this provider doesn't call, so nothing here knows how far
              along you actually are. This is only the most widely-held achievement you're missing,
              and the label says exactly that. "Most players have" would be a lie on a game whose
              commonest missing one sits at 11%. */}
          <span className="steam-eyebrow">Most common missing</span>
          <span className="truncate text-ink">{nextEasiest.displayName}</span>
          <span className="text-ink-faint">{nextEasiest.globalUnlockedPercent!.toFixed(1)}% of players have it</span>
        </p>
      )}
    </div>
  );
}

/** Every achievement for the tracked game in one place: progress, the highlights worth pulling out
 * of the list, and the full unlocked/missing breakdown under a sort toggle. The two sorts exist
 * because they answer different questions — "how rare is what I have, and what's hard that I don't"
 * versus "what have I been getting lately" — which is also why each carries the number it sorted on
 * rather than one fixed detail line. Replaced a separate curated showcase card, whose rarest-5 and
 * next-easiest-5 were both duplicated verbatim in the lists directly beneath it. */
export function SteamAchievementBrowser({ data }: Readonly<{ data: SteamData }>) {
  const [view, setView] = useState<AchievementView>('rarity');

  if (data.availability.achievements !== 'available' || !data.achievements) {
    return <p className="text-sm text-ink-faint">No achievement data for the tracked game right now.</p>;
  }
  const { appId, gameName, unlockedCount, totalCount, recentUnlocks, rarest, nextEasiest, locked } = data.achievements;
  const rows = achievementRows(recentUnlocks, locked, view);
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      <TrackedGameBanner data={data} appId={appId} gameName={gameName} progress={{ unlockedCount, totalCount, pct }} />
      <AchievementSummary rarest={rarest[0]} nextEasiest={nextEasiest[0]} missingCount={locked.length} />
      <fieldset className="steam-sort-toggle" aria-label="Sort achievements by">
        <button type="button" data-active={view === 'rarity'} onClick={() => setView('rarity')}>By rarity</button>
        <button type="button" data-active={view === 'date'} onClick={() => setView('date')}>By date</button>
      </fieldset>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">No achievements for this game yet.</p>
      ) : (
        <ul className="max-h-[30rem] space-y-2 overflow-y-auto pr-1 text-sm">
          {rows.map((row) => (
            <AchievementRow key={row.achievement.apiName} achievement={row.achievement} locked={row.locked} view={view} />
          ))}
        </ul>
      )}
    </div>
  );
}
