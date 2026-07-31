import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@personal-dashboard/shared';
import {
  CLASH_OF_CLANS_APP_ICON_URL,
  CLASH_OF_CLANS_CAPITAL_GOLD_ICON_URL,
  CLASH_OF_CLANS_RAID_WEEKEND_ICON_URL,
  CLASH_OF_CLANS_STAR_ICON_URL,
  CLASH_OF_CLANS_WAR_ICON_URL,
} from '../../../lib/clashOfClans';
import { CLASH_ROYALE_TROPHY_ICON_URL } from '../../../lib/clashRoyale';

function badgeIconUrl(kind: 'war' | 'war-preparation' | 'raid-weekend' | 'league', leagueIconUrl: string | undefined): string {
  if (kind === 'raid-weekend') return CLASH_OF_CLANS_RAID_WEEKEND_ICON_URL;
  if (kind === 'league') return leagueIconUrl ?? CLASH_OF_CLANS_APP_ICON_URL;
  return CLASH_OF_CLANS_WAR_ICON_URL;
}

/** War and raid weekend both get the same badge-plus-stat-row treatment as Clash Royale's
 * win-streak card (see secondary/clashRoyale.tsx) — a badge for the moment, then the one number
 * that matters (star tally or capital loot) rendered with the game's own icon instead of a plain
 * glyph, so it reads as unmistakably Clash of Clans even without a whole backdrop art system.
 * League is tile-only today (see clashOfClans.ts's leagueCandidate), but this still renders it
 * sensibly if it's ever promoted, same as the war-preparation fallback below. */
export function ClashOfClansMomentSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'clash-of-clans-moment') return null;
  const { kind, clanStars, opponentStars, capitalTotalLoot, leagueIconUrl, trophies } = slot.render;
  const badgeSrc = badgeIconUrl(kind, leagueIconUrl);

  return <div className="command-secondary-clash-of-clans mt-4">
    <div className="command-clash-of-clans-badge" aria-hidden>
      <img src={badgeSrc} alt="" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      {kind === 'war' && clanStars !== undefined && opponentStars !== undefined && (
        <p className="command-clash-of-clans-stat" aria-label={`${clanStars} stars for your clan versus ${opponentStars} for the opponent`}>
          <span><img src={CLASH_OF_CLANS_STAR_ICON_URL} alt="" aria-hidden />{clanStars}</span>
          <span className="command-clash-of-clans-stat-sep">vs</span>
          <span><img src={CLASH_OF_CLANS_STAR_ICON_URL} alt="" aria-hidden />{opponentStars}</span>
        </p>
      )}
      {kind === 'raid-weekend' && capitalTotalLoot !== undefined && (
        <p className="command-clash-of-clans-stat" aria-label={`${capitalTotalLoot.toLocaleString()} capital gold looted so far`}>
          <span><img src={CLASH_OF_CLANS_CAPITAL_GOLD_ICON_URL} alt="" aria-hidden />{capitalTotalLoot.toLocaleString()}</span>
        </p>
      )}
      {kind === 'league' && trophies !== undefined && (
        <p className="command-clash-of-clans-stat" aria-label={`${trophies.toLocaleString()} trophies`}>
          <span><img src={CLASH_ROYALE_TROPHY_ICON_URL} alt="" aria-hidden />{trophies.toLocaleString()} trophies</span>
        </p>
      )}
      {kind === 'war-preparation' && <p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p>}
    </div>
  </div>;
}
