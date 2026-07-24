import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@personal-dashboard/shared';
import { Crown } from '../../../widgets/ClashRoyaleWidgets';

/** This only reaches the secondary carousel for a long streak (>10, see clashRoyaleWinStreakCandidate)
 * — short ones are tile-only now, so this card can afford to be a little more celebratory. A big
 * streak badge anchors the card the way AiUsageSecondary's tool mark or Spotify's artwork do, filling
 * the same fixed media height instead of leaving it blank. The per-battle crown score gives the card
 * something concrete to show beyond the count; capped to the most recent 8 so it doesn't wrap forever. */
export function ClashRoyaleWinStreakSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || slot.render.kind !== 'win-streak') return null;
  const streakCrowns = slot.render.streakCrowns;
  if (!streakCrowns?.length) return null;
  return <div className="command-secondary-clash-streak mt-4">
    <div className="command-clash-streak-badge" aria-hidden>
      <span className="command-clash-streak-flame">🔥</span>
      <span className="command-clash-streak-count">{streakCrowns.length}</span>
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      <ol className="command-clash-streak-crowns" aria-label="Crown score for each win in the streak">
        {streakCrowns.slice(-8).map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`}>
            <Crown filled={battle.crownsFor > 0} />
            <span>{battle.crownsFor}–{battle.crownsAgainst}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}
