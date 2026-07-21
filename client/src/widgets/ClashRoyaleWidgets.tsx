import type { ClashRoyaleBattle, ClashRoyaleData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const TROPHY_ROAD_MAX = 14_000;
const PATH_OF_LEGENDS_LEAGUES = [
  'Challenger I', 'Challenger II', 'Challenger III', 'Master I', 'Master II',
  'Master III', 'Champion', 'Grand Champion', 'Royal Champion', 'Ultimate Champion',
] as const;

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

function winRate(data: ClashRoyaleData): number {
  const total = data.profile.wins + data.profile.losses;
  return total === 0 ? 0 : Math.round((data.profile.wins / total) * 100);
}

function recentRecord(battles: ClashRoyaleBattle[]) {
  return battles.reduce((record, battle) => {
    if (battle.result === 'win') record.wins += 1;
    else if (battle.result === 'loss') record.losses += 1;
    else record.draws += 1;
    record.trophies += battle.trophyChange ?? 0;
    return record;
  }, { wins: 0, losses: 0, draws: 0, trophies: 0 });
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

export function ClashRoyaleHero({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const { profile } = data;
  const toFinish = Math.max(TROPHY_ROAD_MAX - profile.trophies, 0);
  const trophyRoadProgress = Math.min((profile.trophies / TROPHY_ROAD_MAX) * 100, 100);

  return (
    <section className={`clash-hero${compact ? ' clash-hero--compact' : ''}`}>
      <div aria-hidden className="clash-hero-sunburst" />
      <div className="clash-hero-copy">
        <div className="clash-hero-kicker">
          <Crown filled />
          <span>{profile.arenaName}</span>
        </div>
        <h2 className="clash-hero-name">{profile.name}</h2>
        <p className="clash-hero-tag">{profile.tag}</p>
        {profile.clanName && (
          <p className="clash-hero-clan">
            <span aria-hidden>◆</span> {profile.clanName}{profile.clanScore !== undefined ? ` · ${formatNumber(profile.clanScore)}` : ''}
          </p>
        )}
      </div>
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
      <div className="clash-level-badge" aria-label={`King level ${profile.expLevel}`}>
        <span>King</span>
        <strong>{profile.expLevel}</strong>
      </div>
    </section>
  );
}

export function ClashRoyalePath({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const path = data.profile.pathOfLegends;
  if (!path) return null;
  const leagueName = PATH_OF_LEGENDS_LEAGUES[path.leagueNumber - 1] ?? `League ${path.leagueNumber}`;
  return (
    <section className={`clash-path${compact ? ' clash-path--compact' : ''}`} aria-label="Path of Legends">
      <div>
        <p className="clash-eyebrow">Ranked</p>
        <p className="clash-path-title">Path of Legends</p>
      </div>
      <div className="clash-path-league">
        <span>League {path.leagueNumber}</span>
        <strong>{leagueName}</strong>
      </div>
      <div className="clash-path-result">
        <strong>{formatNumber(path.trophies)}</strong>
        <span>{path.rank ? `#${formatNumber(path.rank)}` : 'current season'}</span>
      </div>
    </section>
  );
}

export function ClashRoyaleStats({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const record = recentRecord(data.recentBattles);
  return (
    <div className="clash-stats-grid">
      <Stat value={`${winRate(data)}%`} label="career win rate" detail={`${formatNumber(data.profile.wins)} wins`} />
      <Stat value={formatNumber(data.profile.threeCrownWins)} label="three crowns" detail={`${formatNumber(data.profile.battleCount)} battles`} />
      <Stat
        value={data.recentBattles.length === 0 ? '—' : `${record.wins}–${record.losses}${record.draws ? `–${record.draws}` : ''}`}
        label="last battles"
        detail={record.trophies === 0 ? 'No trophy swing' : `${record.trophies > 0 ? '+' : ''}${record.trophies} trophies`}
      />
    </div>
  );
}

export function ClashRoyaleDeck({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const deck = [...data.currentDeck];
  if (data.deckHero) deck.splice(Math.min(data.deckHeroIndex ?? deck.length, deck.length), 0, data.deckHero);
  if (deck.length === 0) return <p className="text-sm text-ink-faint">No current deck reported.</p>;
  return (
    <ul className="clash-deck-grid">
      {deck.map((card) => (
        <li key={card.id} className="clash-card">
          {card.iconUrl ? <img src={card.iconUrl} alt={card.name} loading="lazy" decoding="async" /> : <span aria-hidden>{card.name.charAt(0)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ClashRoyaleChests({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.upcomingChests.length === 0) return <p className="text-sm text-ink-faint">No upcoming chests reported.</p>;
  const nextChest = data.upcomingChests[0];
  return (
    <div className="clash-chest-cycle">
      <div className="clash-next-chest">
        <div className="clash-chest-icon" aria-hidden>
          <span />
        </div>
        <div>
          <p className="clash-eyebrow">Next to unlock</p>
          <p className="clash-next-chest-name">{nextChest}</p>
          <p className="clash-next-chest-note">Win a battle to move the cycle forward.</p>
        </div>
      </div>
      <ol className="clash-chest-queue" aria-label="Upcoming chest cycle">
        {data.upcomingChests.slice(0, 10).map((chest, index) => (
          <li key={`${chest}-${index}`} className={index === 0 ? 'is-next' : ''}>
            <span className="clash-chest-position">{index === 0 ? 'Next' : `+${index}`}</span>
            <span className="clash-chest-name">{chest}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ClashRoyaleBattlePulse({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">Play a battle to start a fresh activity readout.</p>;
  const record = recentRecord(data.recentBattles);
  const streak = currentStreak(data.recentBattles);
  const streakLabel = streak ? `${streak.length}${streak.result === 'win' ? 'W' : streak.result === 'loss' ? 'L' : 'D'} streak` : 'No streak yet';
  return (
    <div className="clash-battle-pulse">
      <div className="clash-battle-pulse-record">
        <p className="clash-eyebrow">Recent form</p>
        <p><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
      </div>
      <div className="clash-battle-pulse-trend">
        <span className={`clash-trend-value ${record.trophies > 0 ? 'is-up' : record.trophies < 0 ? 'is-down' : ''}`}>{record.trophies > 0 ? '+' : ''}{record.trophies}</span>
        <span>{streakLabel}</span>
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
          <div className="clash-result-mark" aria-label={battle.result}>
            <span>{battle.result === 'win' ? 'W' : battle.result === 'loss' ? 'L' : 'D'}</span>
          </div>
          <div className="clash-battle-main">
            <div className="clash-battle-title-row">
              <p>{battle.opponentName ?? 'Unknown opponent'}</p>
              <time dateTime={battle.battleTime}>{relativeTime(battle.battleTime)}</time>
            </div>
            <div className="clash-battle-meta">
              <span>{formatBattleType(battle.type)}</span>
              <span>{battle.result === 'win' ? 'Victory' : battle.result === 'loss' ? 'Defeat' : 'Draw'}</span>
            </div>
          </div>
          <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
            <div><span>{battle.crownsFor}</span><Crown filled={battle.crownsFor > 0} /></div>
            <em>–</em>
            <div><Crown filled={battle.crownsAgainst > 0} /><span>{battle.crownsAgainst}</span></div>
          </div>
          {battle.trophyChange !== undefined && (
            <span className={`clash-trophy-change ${battle.trophyChange > 0 ? 'is-up' : battle.trophyChange < 0 ? 'is-down' : ''}`}>{battle.trophyChange > 0 ? '+' : ''}{battle.trophyChange}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
