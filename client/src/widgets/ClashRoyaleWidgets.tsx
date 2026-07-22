import type { ClashRoyaleBattle, ClashRoyaleData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';
import { clashRoyaleLeagueArt } from '../lib/clashRoyale';

const TROPHY_ROAD_MAX = 14_000;
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

function winRate(data: ClashRoyaleData): number {
  const total = data.profile.wins + data.profile.losses;
  return total === 0 ? 0 : Math.round((data.profile.wins / total) * 100);
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

function formatRecentRecord(record: ReturnType<typeof recentRecord>): string {
  return [record.wins, record.losses, record.draws || undefined]
    .filter((value): value is number => value !== undefined)
    .join('–');
}

function currentStreak(battles: ClashRoyaleBattle[]): { result: ClashRoyaleBattle['result']; length: number } | undefined {
  const latest = battles[0];
  if (!latest) return undefined;
  let length = 0;
  for (const battle of battles) {
    if (battle.result !== latest.result) break;
    length += 1;
  }
  return { result: latest.result, length };
}

function streakModifier(result: ClashRoyaleBattle['result'] | undefined): string {
  if (result === 'win') return ' is-up';
  if (result === 'loss') return ' is-down';
  return '';
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

function Stat({ value, label, detail }: Readonly<{ value: string | number; label: string; detail?: string }>) {
  return (
    <div className="clash-stat">
      <p className="clash-stat-value">{value}</p>
      <p className="clash-stat-label">{label}</p>
      {detail && <p className="clash-stat-detail">{detail}</p>}
    </div>
  );
}

export function ClashRoyaleProfile({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const { profile } = data;
  const path = profile.pathOfLegends;
  const toFinish = Math.max(TROPHY_ROAD_MAX - profile.trophies, 0);
  const trophyRoadProgress = Math.min((profile.trophies / TROPHY_ROAD_MAX) * 100, 100);
  const leagueName = path ? PATH_OF_LEGENDS_LEAGUES[path.leagueNumber - 1] ?? `League ${path.leagueNumber}` : undefined;

  return (
    <section className={`clash-profile${compact ? ' clash-profile--compact' : ''}`}>
      <div className="clash-profile-main">
        <div className="clash-profile-kicker">
          <Crown filled />
          <span>{profile.arenaName}</span>
        </div>
        <h2 className="clash-profile-name">{profile.name}</h2>
        <p className="clash-profile-tag">{profile.tag}</p>
        {profile.clanName && (
          <p className="clash-profile-clan">
            <span aria-hidden>◆</span> {profile.clanName}{profile.clanScore !== undefined ? ` · ${formatNumber(profile.clanScore)}` : ''}
          </p>
        )}
      </div>
      <div className="clash-profile-panels">
        <div className="clash-trophy-panel">
          <p className="clash-trophy-label">Trophy road</p>
          <p className="clash-trophy-value">{formatNumber(profile.trophies)}</p>
          <div className="clash-trophy-progress" aria-label={`${Math.round(trophyRoadProgress)} percent of the 14,000-trophy Trophy Road`}>
            <span style={{ width: `${trophyRoadProgress}%` }} />
          </div>
          <p className="clash-trophy-note">
            {toFinish === 0 ? 'Trophy Road complete · 14,000 max' : `${formatNumber(toFinish)} to 14,000 max`}
          </p>
        </div>
        {path && (
          <div className="clash-path-panel">
            <p className="clash-eyebrow">Path of Legends</p>
            <div className="clash-path-league">
              {clashRoyaleLeagueArt(path.leagueNumber) && (
                <span className="clash-path-league-badge-frame">
                  <img src={clashRoyaleLeagueArt(path.leagueNumber)} alt="" aria-hidden className="clash-path-league-badge" />
                </span>
              )}
              <div className="min-w-0">
                <p className="clash-path-league-name">{leagueName}</p>
                <div className="clash-path-figures">
                  <strong>{formatNumber(path.trophies)}</strong>
                  <span>{path.rank ? `#${formatNumber(path.rank)}` : 'current season'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="clash-level-badge" aria-label={`King level ${profile.expLevel}`}>
        <span>King</span>
        <strong>{profile.expLevel}</strong>
      </div>
    </section>
  );
}

export function ClashRoyaleStats({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const record = recentRecord(data.recentBattles);
  const recordSummary = data.recentBattles.length === 0 ? '—' : formatRecentRecord(record);
  return (
    <div className="clash-stats-grid">
      <Stat value={`${winRate(data)}%`} label="career win rate" detail={`${formatNumber(data.profile.wins)} wins`} />
      <Stat value={formatNumber(data.profile.threeCrownWins)} label="three crowns" detail={`${formatNumber(data.profile.battleCount)} battles`} />
      <Stat
        value={recordSummary}
        label="last battles"
      />
    </div>
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
  const record = recentRecord(data.recentBattles);
  const streak = currentStreak(data.recentBattles);
  let streakLabel = 'No streak yet';
  if (streak) {
    streakLabel = `${streak.length}${STREAK_RESULT_LABELS[streak.result]} streak`;
  }
  return (
    <div className="clash-battle-pulse">
      <div className="clash-battle-pulse-record">
        <p className="clash-eyebrow">Recent form</p>
        <p><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
      </div>
      <div className="clash-battle-pulse-trend">
        <span className={`clash-streak-badge${streakModifier(streak?.result)}`}>{streakLabel}</span>
      </div>
      <ol className="clash-form-strip" aria-label="Results of recent battles">
        {data.recentBattles.slice(0, 10).reverse().map((battle, index) => <li key={`${battle.battleTime}-${index}`} data-result={battle.result}>{battle.result.charAt(0).toUpperCase()}</li>)}
      </ol>
    </div>
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
