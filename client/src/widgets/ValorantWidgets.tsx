import type { ValorantData, ValorantMatch } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const RESULT_LABELS: Record<ValorantMatch['result'], string> = {
  win: 'Victory',
  loss: 'Defeat',
  draw: 'Draw',
};
const STREAK_RESULT_LABELS: Record<ValorantMatch['result'], string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

function kda(match: ValorantMatch): string {
  return `${match.kills}/${match.deaths}/${match.assists}`;
}

function headshotRate(match: ValorantMatch): number {
  const totalShots = match.headshots + match.bodyshots + match.legshots;
  return totalShots === 0 ? 0 : Math.round((match.headshots / totalShots) * 100);
}

function recentRecord(matches: ValorantMatch[]) {
  return matches.reduce((record, match) => {
    if (match.result === 'win') record.wins += 1;
    else if (match.result === 'loss') record.losses += 1;
    else record.draws += 1;
    return record;
  }, { wins: 0, losses: 0, draws: 0 });
}

function currentStreak(matches: ValorantMatch[]): { result: ValorantMatch['result']; length: number } | undefined {
  const latest = matches[0];
  if (!latest) return undefined;
  let length = 0;
  for (const match of matches) {
    if (match.result !== latest.result) break;
    length += 1;
  }
  return { result: latest.result, length };
}

function streakModifier(result: ValorantMatch['result'] | undefined): string {
  if (result === 'win') return ' is-up';
  if (result === 'loss') return ' is-down';
  return '';
}

function Stat({ value, label, detail }: Readonly<{ value: string | number; label: string; detail?: string }>) {
  return (
    <div className="valorant-stat">
      <p className="valorant-stat-value">{value}</p>
      <p className="valorant-stat-label">{label}</p>
      {detail && <p className="valorant-stat-detail">{detail}</p>}
    </div>
  );
}

export function ValorantProfile({ data, compact = false }: Readonly<{ data: ValorantData; compact?: boolean }>) {
  const { profile, rank } = data;
  return (
    <section className={`valorant-profile${compact ? ' valorant-profile--compact' : ''}`}>
      {profile.cardIconUrl && (
        <img src={profile.cardIconUrl} alt="" aria-hidden className="valorant-card-art" loading="lazy" decoding="async" />
      )}
      <div className="valorant-profile-main">
        <div className="valorant-profile-kicker">
          <span>{profile.region.toUpperCase()}</span>
        </div>
        <h2 className="valorant-profile-name">{profile.name}</h2>
        <p className="valorant-profile-tag">#{profile.tag}</p>
      </div>
      <div className="valorant-rank-panel">
        {rank.tierIconUrl && <img src={rank.tierIconUrl} alt="" aria-hidden className="valorant-rank-icon" loading="lazy" decoding="async" />}
        <div>
          <p className="valorant-rank-name">{rank.tierName}</p>
          <p className="valorant-rank-rr">{rank.rr} RR{rank.leaderboardRank ? ` · #${formatNumber(rank.leaderboardRank)}` : ''}</p>
        </div>
      </div>
      <div className="valorant-level-badge" aria-label={`Account level ${profile.accountLevel}`}>
        <span>Level</span>
        <strong>{profile.accountLevel}</strong>
      </div>
    </section>
  );
}

export function ValorantStats({ data }: Readonly<{ data: ValorantData }>) {
  const record = recentRecord(data.recentMatches);
  const recordSummary = data.recentMatches.length === 0 ? '—' : [record.wins, record.losses, record.draws || undefined].filter((v): v is number => v !== undefined).join('–');
  const seasonWinRate = data.currentSeason && data.currentSeason.games > 0 ? Math.round((data.currentSeason.wins / data.currentSeason.games) * 100) : undefined;
  return (
    <div className="valorant-stats-grid">
      <Stat value={data.peak.tierName} label="peak rank" detail={data.peak.seasonShort ? `season ${data.peak.seasonShort}` : undefined} />
      <Stat
        value={seasonWinRate !== undefined ? `${seasonWinRate}%` : '—'}
        label="season win rate"
        detail={data.currentSeason ? `${formatNumber(data.currentSeason.wins)}/${formatNumber(data.currentSeason.games)} games` : undefined}
      />
      <Stat value={recordSummary} label="last matches" />
    </div>
  );
}

export function ValorantMatchPulse({ data }: Readonly<{ data: ValorantData }>) {
  if (data.recentMatches.length === 0) return <p className="text-sm text-ink-faint">Play a match to start a fresh form readout.</p>;
  const record = recentRecord(data.recentMatches);
  const streak = currentStreak(data.recentMatches);
  let streakLabel = 'No streak yet';
  if (streak) {
    streakLabel = `${streak.length}${STREAK_RESULT_LABELS[streak.result]} streak`;
  }
  return (
    <div className="valorant-match-pulse">
      <div className="valorant-match-pulse-record">
        <p className="valorant-eyebrow">Recent form</p>
        <p><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
      </div>
      <div className="valorant-match-pulse-trend">
        <span className={`valorant-streak-badge${streakModifier(streak?.result)}`}>{streakLabel}</span>
      </div>
      <ol className="valorant-form-strip" aria-label="Results of recent matches">
        {data.recentMatches.slice(0, 10).reverse().map((match, index) => <li key={`${match.matchId}-${index}`} data-result={match.result}>{match.result.charAt(0).toUpperCase()}</li>)}
      </ol>
    </div>
  );
}

export function ValorantMatchLog({ data }: Readonly<{ data: ValorantData }>) {
  if (data.recentMatches.length === 0) return <p className="text-sm text-ink-faint">No recent matches.</p>;
  return (
    <ol className="valorant-match-log">
      {data.recentMatches.map((match, index) => (
        <li key={`${match.matchId}-${index}`} className="valorant-match-row" data-result={match.result}>
          {match.agentIconUrl && <img src={match.agentIconUrl} alt={match.agentName} className="valorant-agent-icon" loading="lazy" decoding="async" />}
          <div className="valorant-match-main">
            <div className="valorant-match-title-row">
              <p>{match.map}{match.roundsWon !== undefined && match.roundsLost !== undefined ? ` · ${match.roundsWon}-${match.roundsLost}` : ''}</p>
              <time dateTime={match.startedAt}>{relativeTime(match.startedAt)}</time>
            </div>
            <div className="valorant-match-meta">
              <span>{match.mode}</span>
              <span>{RESULT_LABELS[match.result]}</span>
              <span>{kda(match)} KDA</span>
              <span>{headshotRate(match)}% HS</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
