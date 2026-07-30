import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@personal-dashboard/shared';
import { clashRoyaleBattleIcon } from '../../../lib/clashRoyale';
import { ClashCrownScore, TrimmedBattleModeIcon } from '../../../widgets/ClashRoyaleWidgets';

/** This only reaches the secondary carousel for a long streak (>10, see clashRoyaleWinStreakCandidate)
 * — short ones are tile-only now, so this card can afford to be a little more celebratory. The badge
 * shows the mode of the streak's most recent win (trophy road / 2v2 / clan wars / merge tactics /
 * Path of Legends league) via the same lookup the recent-battles pulse uses, rather than a generic
 * glyph. Each streak win gets the same crown-score chip as the battle log (`ClashCrownScore`) — a
 * single non-wrapping row, capped at the most recent 5 with a "+N" chip for the rest, so a long
 * streak never overflows the carousel's fixed content height. */
export function ClashRoyaleWinStreakSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-royale-moment' || slot.render.kind !== 'win-streak') return null;
  const { streakCrowns, streakBattleMode, pathOfLegendsLeagueNumber } = slot.render;
  if (!streakCrowns?.length) return null;
  const icon = streakBattleMode ? clashRoyaleBattleIcon(streakBattleMode, pathOfLegendsLeagueNumber) : undefined;
  const shown = streakCrowns.slice(-5);
  const hiddenCount = streakCrowns.length - shown.length;
  return <div className="command-secondary-clash-streak mt-4">
    <div className="command-clash-streak-badge" aria-hidden>
      {icon && <TrimmedBattleModeIcon src={icon.src} isAppIcon={icon.isAppIcon} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      <ol className="command-clash-streak-crowns" aria-label="Crown score for each win in the streak">
        {hiddenCount > 0 && <li className="command-clash-streak-crowns-overflow">+{hiddenCount}</li>}
        {shown.map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`}>
            <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
              <ClashCrownScore crownsFor={battle.crownsFor} crownsAgainst={battle.crownsAgainst} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}
