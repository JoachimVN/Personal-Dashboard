import { useState } from 'react';
import type { SteamData } from '@personal-dashboard/shared';
import { accent, formatHours } from './shared';

export function SteamNowPlaying({ data }: Readonly<{ data: SteamData }>) {
  const recent = [...data.recentlyPlayed].sort((a, b) => (b.playtimeRecentMinutes ?? 0) - (a.playtimeRecentMinutes ?? 0))[0];
  // Steam's "recently played" is a strict last-2-weeks window — someone with a big library but no
  // play in that window would otherwise see a blank card despite having plenty of history to show.
  const game = data.currentGame ?? recent ?? data.library?.mostPlayed[0];
  const [headerFailed, setHeaderFailed] = useState(false);
  if (!game) return <p className="text-sm text-ink-faint">No recent Steam activity.</p>;
  const hasHeader = Boolean(game.headerUrl) && !headerFailed;
  let label: string;
  if (data.currentGame) label = 'Playing now';
  else if (recent) label = 'Top played recently';
  else label = 'All-time favourite';
  return (
    <div className="steam-hero p-4 sm:p-5">
      {hasHeader && (
        <img aria-hidden src={game.headerUrl} alt="" className="steam-hero-backdrop" onError={() => setHeaderFailed(true)} />
      )}
      <div className="steam-hero-scrim" />
      <div className="relative flex items-center gap-4">
        {hasHeader ? (
          <img
            src={game.headerUrl}
            alt=""
            className="h-20 w-32 shrink-0 rounded-xl object-cover shadow-lg sm:h-24 sm:w-40"
            onError={() => setHeaderFailed(true)}
          />
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
