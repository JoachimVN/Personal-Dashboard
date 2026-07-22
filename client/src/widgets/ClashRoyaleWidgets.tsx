import type { ClashRoyaleBattle, ClashRoyaleData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';
import { clashRoyaleLeagueArt } from '../lib/clashRoyale';

const PATH_OF_LEGENDS_LEAGUES = [
  'Challenger I', 'Challenger II', 'Challenger III', 'Master I', 'Master II',
  'Master III', 'Champion', 'Grand Champion', 'Royal Champion', 'Ultimate Champion',
] as const;
const BATTLE_RESULT_LABELS: Record<ClashRoyaleBattle['result'], string> = {
  win: 'Victory',
  loss: 'Defeat',
  draw: 'Draw',
};
const STREAK_RESULT_LABELS: Record<ClashRoyaleBattle['result'], string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

/** Win/loss/draw tally only — battle trophyChange isn't safe to sum across battles: Path of
 * Legends swings share the same field but aren't fixed-size like ladder trophies, so a mixed-mode
 * sum reads as a plausible but meaningless "trophy gain". Individual battles still show their own
 * real trophyChange in the battle log, just never combined across battles of different types. */
function recentRecord(battles: ClashRoyaleBattle[]) {
  return battles.reduce((record, battle) => {
    if (battle.result === 'win') record.wins += 1;
    else if (battle.result === 'loss') record.losses += 1;
    else record.draws += 1;
    return record;
  }, { wins: 0, losses: 0, draws: 0 });
}

function formatBattleType(type: string): string {
  return type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Crown({ filled }: Readonly<{ filled: boolean }>) {
  return (
    <svg viewBox="0 0 24 18" aria-hidden className="clash-crown">
      <path d="M2 15.5h20l-1.1-8.9-5.4 4.3L12 2.5 8.5 10.9 3.1 6.6 2 15.5Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ClashRoyaleProfile({ data, compact = false, showArena = true, showKingLevel = true }: Readonly<{ data: ClashRoyaleData; compact?: boolean; showArena?: boolean; showKingLevel?: boolean }>) {
  const { profile } = data;
  const path = profile.pathOfLegends;
  const leagueName = path ? PATH_OF_LEGENDS_LEAGUES[path.leagueNumber - 1] ?? `League ${path.leagueNumber}` : undefined;

  return (
    <section className={`clash-profile${compact ? ' clash-profile--compact' : ''}${showArena ? '' : ' clash-profile--no-arena'}`}>
      <div className="clash-profile-main">
        {showArena && (
          <div className="clash-profile-kicker">
            <Crown filled />
            <span>{profile.arenaName}</span>
          </div>
        )}
        <h2 className="clash-profile-name">{profile.name}</h2>
        <p className="clash-profile-tag">{profile.tag}</p>
        {profile.clanName && (
          <p className="clash-profile-clan">
            {profile.clanBadgeUrl && <img src={profile.clanBadgeUrl} alt="" aria-hidden width="18" height="18" decoding="async" />}
            {profile.clanName}{profile.clanScore !== undefined ? ` · ${formatNumber(profile.clanScore)}` : ''}
          </p>
        )}
      </div>
      <div className="clash-profile-panels">
        <div className="clash-trophy-panel">
          <p className="clash-trophy-label">Trophy road</p>
          <p className="clash-trophy-value">{formatNumber(profile.trophies)}</p>
        </div>
        {path && (
          <div className="clash-path-panel">
            <p className="clash-eyebrow">Path of Legends</p>
            <div className="clash-path-league">
              {clashRoyaleLeagueArt(path.leagueNumber) && (
                <img src={clashRoyaleLeagueArt(path.leagueNumber)} alt="" aria-hidden className="clash-path-league-badge" />
              )}
              <div className="min-w-0">
                <p className="clash-path-league-name">{leagueName}</p>
                {(path.trophies > 0 || (path.rank ?? 0) > 0) && (
                  <div className="clash-path-figures">
                    {path.trophies > 0 && <strong>{formatNumber(path.trophies)}</strong>}
                    {path.rank !== undefined && path.rank !== null && path.rank > 0 && <span>#{formatNumber(path.rank)}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {showKingLevel && (
        <div className="clash-level-badge" aria-label={`King level ${profile.expLevel}`}>
          <span>King</span>
          <strong>{profile.expLevel}</strong>
        </div>
      )}
    </section>
  );
}

export function ClashRoyaleDeck({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const deck = [...data.currentDeck];
  if (data.deckHero) deck.splice(Math.min(data.deckHeroIndex ?? deck.length, deck.length), 0, data.deckHero);
  if (deck.length === 0) return <p className="text-sm text-ink-faint">No current deck reported.</p>;
  return (
    <ul className={`clash-deck-grid${compact ? ' clash-deck-grid--compact' : ''}`}>
      {deck.map((card) => (
        <li key={card.id} className="clash-card">
          {card.iconUrl ? <img src={card.iconUrl} alt={card.name} loading="lazy" decoding="async" /> : <span aria-hidden>{card.name.charAt(0)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ClashRoyaleBattlePulse({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">Play a battle to start a fresh activity readout.</p>;
  const battles = data.recentBattles;
  const record = recentRecord(battles);
  const battleCount = battles.length;
  const winRate = Math.round((record.wins / battleCount) * 100);
  return (
    <section className="clash-recent-games">
      <header className="clash-recent-games-header">
        <div>
          <p className="clash-eyebrow">Last 10 games</p>
          <p className="clash-recent-games-record"><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
        </div>
        <p className="clash-recent-games-rate"><strong>{winRate}%</strong><span>win rate</span></p>
      </header>
      <ol className="clash-recent-games-grid" aria-label="Results of recent battles, oldest to newest">
        {battles.slice(0, 10).reverse().map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`} data-result={battle.result} aria-label={`${BATTLE_RESULT_LABELS[battle.result]}, ${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
            <span className="clash-recent-games-result">{STREAK_RESULT_LABELS[battle.result]}</span>
            <span className="clash-recent-games-score">{battle.crownsFor}–{battle.crownsAgainst}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ClashRoyaleBattleLog({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">No recent battles.</p>;
  return (
    <ol className="clash-battle-log">
      {data.recentBattles.map((battle, index) => (
        <li key={`${battle.battleTime}-${index}`} className="clash-battle-row" data-result={battle.result}>
          <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
            <div className="clash-crown-count">
              <strong>{battle.crownsFor}</strong>
              <Crown filled={battle.crownsFor > 0} />
            </div>
            <span aria-hidden className="clash-score-versus">vs</span>
            <div className="clash-crown-count">
              <Crown filled={battle.crownsAgainst > 0} />
              <strong>{battle.crownsAgainst}</strong>
            </div>
          </div>
          <div className="clash-battle-main">
            <div className="clash-battle-title-row">
              <p>{battle.opponentName ?? 'Unknown opponent'}</p>
              <time dateTime={battle.battleTime}>{relativeTime(battle.battleTime)}</time>
            </div>
            <div className="clash-battle-meta">
              <span>{formatBattleType(battle.type)}</span>
              <span>{BATTLE_RESULT_LABELS[battle.result]}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
