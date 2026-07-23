import { useEffect, useRef } from 'react';
import type { ValorantData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import { actLabel, formatNumber, kda, recentRecord, RESULT_LABELS } from '../../widgets/ValorantWidgets';
import './valorant.css';

/* The whole overview card is one link (see SectionCard), same convention as ClashRoyaleOverview. */

export function ValorantOverview() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <ValorantOverviewContent data={data} />
      )}
    </WidgetBody>
  );
}

function ValorantOverviewContent({ data }: Readonly<{ data: ValorantData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const cardArtUrl = data.profile.cardIconUrl;
  const { profile, rank, peak, recentMatches, currentSeason } = data;
  const record = recentRecord(recentMatches);
  const seasonWinRate = currentSeason && currentSeason.games > 0
    ? Math.round((currentSeason.wins / currentSeason.games) * 100)
    : undefined;

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--valorant');
    if (!card) return undefined;
    if (!cardArtUrl) {
      card.style.removeProperty('--valorant-card-art');
      return undefined;
    }

    const probe = new Image();
    probe.onload = () => card.style.setProperty('--valorant-card-art', `url("${cardArtUrl}")`);
    probe.src = cardArtUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--valorant-card-art');
    };
  }, [cardArtUrl]);

  return (
    <div ref={overviewRef} className="valorant-overview">
      <section className="valorant-overview-briefing">
        <div className="valorant-overview-identity">
          <p className="valorant-overview-kicker">{profile.region.toUpperCase()}</p>
          <h2 className="valorant-overview-name">{profile.name}<span>#{profile.tag}</span></h2>
          <p className="valorant-overview-level">Account level <strong>{formatNumber(profile.accountLevel)}</strong></p>
        </div>
        <div className="valorant-overview-rank">
          {rank.tierIconUrl && <img src={rank.tierIconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
          <div>
            <p>Current rank</p>
            <strong>{rank.tierName}</strong>
            <span>{rank.rr} RR{rank.leaderboardRank ? ` · #${formatNumber(rank.leaderboardRank)}` : ''}</span>
          </div>
        </div>
      </section>

      <div className="valorant-overview-readout">
        <dl className="valorant-overview-metrics">
          <div>
            <dt>Peak rank</dt>
            <dd>{peak.tierName}</dd>
            {peak.seasonShort && <small>{actLabel(peak.seasonShort)}</small>}
          </div>
          <div>
            <dt>Act win rate</dt>
            <dd>{seasonWinRate === undefined ? '—' : `${seasonWinRate}%`}</dd>
            {currentSeason && <small>{currentSeason.wins}W / {currentSeason.games} played</small>}
          </div>
          <div>
            <dt>Recent record</dt>
            <dd>{recentMatches.length === 0 ? '—' : `${record.wins}–${record.losses}${record.draws ? `–${record.draws}` : ''}`}</dd>
            <small>{recentMatches.length === 0 ? 'No matches yet' : `${recentMatches.length} latest matches`}</small>
          </div>
        </dl>
        {recentMatches.length > 0 && (
          <ol className="valorant-overview-form" aria-label="Results of recent matches">
            {recentMatches.slice(0, 8).reverse().map((match, index) => (
              <li key={`${match.matchId}-${index}`} data-result={match.result} aria-label={match.result}>
                {match.result.charAt(0).toUpperCase()}
              </li>
            ))}
          </ol>
        )}
      </div>

      {recentMatches.length > 0 && (
        <section className="valorant-overview-matches">
          <div className="valorant-overview-matches-heading">
            <p>Recent matches</p>
            <span>Latest {Math.min(recentMatches.length, 3)}</span>
          </div>
          <ol>
            {recentMatches.slice(0, 3).map((match, index) => {
              const score = match.roundsWon !== undefined && match.roundsLost !== undefined
                ? `${match.roundsWon}–${match.roundsLost}`
                : RESULT_LABELS[match.result];
              return (
                <li key={`${match.matchId}-${index}`} data-result={match.result}>
                  {match.agentIconUrl && <img src={match.agentIconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
                  <div className="valorant-overview-match-main">
                    <p>{match.map}</p>
                    <span>{match.agentName} · {match.mode} · {relativeTime(match.startedAt)}</span>
                  </div>
                  <div className="valorant-overview-match-result">
                    <strong>{score}</strong>
                    <span>{kda(match)} KDA</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
