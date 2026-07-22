import { useState } from 'react';
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

function averageCombatScore(matches: ValorantMatch[]): number | undefined {
  const totalRounds = matches.reduce((total, match) => total + (match.roundsWon ?? 0) + (match.roundsLost ?? 0), 0);
  if (totalRounds === 0) return undefined;
  return Math.round(matches.reduce((total, match) => total + match.score, 0) / totalRounds);
}

function actLabel(short: string): string {
  const match = /^e(\d+)a(\d+)$/i.exec(short);
  return match ? `E${match[1]} · A${match[2]}` : short.toUpperCase();
}

interface AgentSummary {
  name: string;
  iconUrl?: string;
  matches: ValorantMatch[];
}

function agentSummaries(matches: ValorantMatch[]): AgentSummary[] {
  const agents = new Map<string, AgentSummary>();
  for (const match of matches) {
    const summary = agents.get(match.agentName) ?? { name: match.agentName, iconUrl: match.agentIconUrl, matches: [] };
    summary.matches.push(match);
    agents.set(match.agentName, summary);
  }
  return [...agents.values()].sort((a, b) => b.matches.length - a.matches.length || b.matches.filter((match) => match.result === 'win').length - a.matches.filter((match) => match.result === 'win').length);
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

/** A period selector deliberately works on the server-provided archive so switching scope is
 * instantaneous and never causes the browser to call HenrikDev or expose its API key. */
export function ValorantPerformance({ data }: Readonly<{ data: ValorantData }>) {
  const { history } = data;
  const now = Date.now();
  const twoWeekMatches = history.matches.filter((match) => Date.parse(match.startedAt) >= now - 14 * 24 * 60 * 60_000);
  const actCodes = [...new Set(history.matches.map((match) => match.actShort).filter((act): act is string => Boolean(act)))];
  const periodOptions = [
    { id: 'two-weeks', label: '2 weeks', matches: twoWeekMatches },
    ...(history.currentActShort ? [{ id: `act:${history.currentActShort}`, label: 'Current act', matches: history.matches.filter((match) => match.actShort === history.currentActShort) }] : []),
    ...actCodes
      .filter((act) => act !== history.currentActShort)
      .map((act) => ({ id: `act:${act}`, label: actLabel(act), matches: history.matches.filter((match) => match.actShort === act) })),
    { id: 'career', label: 'Career', matches: history.matches },
  ].filter((period) => period.id === 'career' || period.matches.length > 0);
  const [selectedPeriodId, setSelectedPeriodId] = useState('two-weeks');
  const selectedPeriod = periodOptions.find((period) => period.id === selectedPeriodId) ?? periodOptions[0];
  if (!selectedPeriod) return null;

  const matches = selectedPeriod.matches;
  const record = recentRecord(matches);
  const winRate = matches.length === 0 ? undefined : Math.round((record.wins / matches.length) * 100);
  const acs = averageCombatScore(matches);
  const agents = agentSummaries(matches).slice(0, 5);
  const loadedCount = history.matches.length;
  const coverage = `${formatNumber(Math.max(loadedCount, history.totalMatchesAvailable))} matches captured`;

  return (
    <section className="valorant-performance">
      <div className="valorant-performance-heading">
        <div>
          <p className="valorant-eyebrow">Performance</p>
          <h3>Agent pool</h3>
        </div>
        <p>{coverage}</p>
      </div>
      <div className="valorant-periods" role="tablist" aria-label="Valorant performance period">
        {periodOptions.map((period) => (
          <button
            key={period.id}
            type="button"
            role="tab"
            aria-selected={period.id === selectedPeriod.id}
            className={period.id === selectedPeriod.id ? 'is-selected' : undefined}
            onClick={() => setSelectedPeriodId(period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-ink-faint">No matches are available for this period yet.</p>
      ) : (
        <>
          <div className="valorant-performance-stats">
            <Stat value={matches.length} label="matches" />
            <Stat value={winRate === undefined ? '—' : `${winRate}%`} label="win rate" detail={`${record.wins}W · ${record.losses}L${record.draws ? ` · ${record.draws}D` : ''}`} />
            <Stat value={acs ?? '—'} label="average ACS" />
          </div>
          <ol className="valorant-agent-pool">
            {agents.map((agent) => {
              const agentRecord = recentRecord(agent.matches);
              const agentWinRate = Math.round((agentRecord.wins / agent.matches.length) * 100);
              return (
                <li key={agent.name}>
                  {agent.iconUrl && <img src={agent.iconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
                  <div>
                    <p>{agent.name}</p>
                    <span>{agent.matches.length} matches · {agentWinRate}% win rate</span>
                  </div>
                  <strong>{averageCombatScore(agent.matches) ?? '—'} <small>ACS</small></strong>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="valorant-history-note">Career expands from HenrikDev&apos;s paginated history and is not a guaranteed complete Riot match record.</p>
    </section>
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
  const matches = data.history.matches;
  if (matches.length === 0) return <p className="text-sm text-ink-faint">No matches captured yet.</p>;
  return (
    <ol className="valorant-match-log">
      {matches.map((match, index) => (
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
