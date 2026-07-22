import { useState } from 'react';
import { motion } from 'motion/react';
import type { ValorantData, ValorantMatch } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import { valorantMapArt } from '../../lib/valorant';
import {
  RESULT_LABELS,
  ValorantMatchLog,
  ValorantPerformance,
  type AgentSummary,
  actLabel,
  agentSummaries,
  aggregateHeadshotRate,
  formatNumber,
  kda,
  killDeathRatio,
  performancePeriods,
  recentRecord,
  recentSpotlightMatches,
} from '../../widgets/ValorantWidgets';
import { DetailSectionHeading } from '../DetailIntro';
import './valorant.css';

/* client/public/valorant_wordmark.png is solid black on a transparent ground, so it's applied as
   a CSS mask (tinted via currentColor) rather than rendered as-is. */
function ValorantWordmark() {
  return (
    <span
      role="img"
      aria-label="Valorant"
      className="block h-[0.9rem]"
      style={{
        aspectRatio: '3633 / 533',
        backgroundColor: 'currentColor',
        maskImage: 'url(/valorant_wordmark.png)',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        maskSize: 'contain',
        WebkitMaskImage: 'url(/valorant_wordmark.png)',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

/** A ring rather than another boxed Stat tile — it echoes the RR bar's arc language and reads at
 * a glance without needing a label to explain what "62%" refers to. */
function WinRateRing({ percent }: Readonly<{ percent: number | undefined }>) {
  const size = 76;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent === undefined ? 0 : Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="valorant-hero-ring"
      role="img"
      aria-label={percent === undefined ? 'Win rate unavailable' : `${percent}% win rate this act`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} className="valorant-hero-ring-track" strokeWidth={stroke} fill="none" />
      {percent !== undefined && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="valorant-hero-ring-fill"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x="50%" y="51%" textAnchor="middle" dominantBaseline="central" className="valorant-hero-ring-text">
        {percent !== undefined ? `${percent}%` : '—'}
      </text>
    </svg>
  );
}

/** Half of the split act card — K/D and headshot% flank the win-rate ring on the left, games and
 * top agent flank it on the right, all centered within this half. */
function ValorantActHalf({ eyebrow, badge, winRate, kd, hsPercent, games, topAgent }: Readonly<{
  eyebrow: string;
  badge?: string;
  winRate: number | undefined;
  kd: number | undefined;
  hsPercent: number | undefined;
  games: number | undefined;
  topAgent: AgentSummary | undefined;
}>) {
  return (
    <div className="valorant-hero-act-half">
      <div className="valorant-hero-act-heading">
        <p className="valorant-eyebrow">{eyebrow}</p>
        {badge && <span className="valorant-hero-act-badge">{badge}</span>}
      </div>
      <div className="valorant-hero-act-summary">
        <dl className="valorant-hero-act-metrics valorant-hero-act-metrics-left">
          <div className="valorant-hero-act-metric">
            <dd>{kd !== undefined ? kd.toFixed(2) : '—'}</dd>
            <dt>K/D</dt>
          </div>
          <div className="valorant-hero-act-metric">
            <dd>{hsPercent !== undefined ? `${hsPercent}%` : '—'}</dd>
            <dt>Headshot %</dt>
          </div>
        </dl>
        <div className="valorant-hero-act-ring-wrap">
          <WinRateRing percent={winRate} />
          <span className="valorant-hero-act-ring-label">Win rate</span>
        </div>
        <dl className="valorant-hero-act-metrics valorant-hero-act-metrics-right">
          <div className="valorant-hero-act-metric">
            <dd>{games !== undefined ? formatNumber(games) : '—'}</dd>
            <dt>Games</dt>
          </div>
          <div className="valorant-hero-act-metric valorant-hero-act-metric-agent">
            <dd>
              {topAgent?.iconUrl && <img src={topAgent.iconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
              <span>{topAgent?.name ?? '—'}</span>
            </dd>
            <dt>Top agent</dt>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** The hero leans on the equipped player card's tall "large art" render as a portrait backdrop —
 * a different asset from the wide art the compact overview card uses, see cardBannerUrl. */
function ValorantHero({ data }: Readonly<{ data: ValorantData }>) {
  const { profile, rank } = data;
  const rrPercent = Math.max(0, Math.min(100, rank.rr));
  const actShort = data.history.currentActShort;
  const actPeriod = actShort ? performancePeriods(data).find((period) => period.id === `act:${actShort}`) : undefined;
  const actMatches = actPeriod?.matches ?? [];
  const actKd = killDeathRatio(actMatches);
  const actHsPercent = aggregateHeadshotRate(actMatches);
  const actTopAgent = agentSummaries(actMatches)[0];
  const actGames = data.currentSeason?.games;
  const actWins = data.currentSeason?.wins;
  const actWinRate = actGames !== undefined && actGames > 0 && actWins !== undefined ? Math.round((actWins / actGames) * 100) : undefined;

  const careerMatches = data.history.matches;
  const careerRecord = recentRecord(careerMatches);
  const careerWinRate = careerMatches.length > 0 ? Math.round((careerRecord.wins / careerMatches.length) * 100) : undefined;
  const careerKd = killDeathRatio(careerMatches);
  const careerHsPercent = aggregateHeadshotRate(careerMatches);
  const careerTopAgent = agentSummaries(careerMatches)[0];

  const spotlight = recentSpotlightMatches(data.recentMatches, 3);

  return (
    <motion.section
      className="valorant-hero relative mb-5 overflow-hidden rounded-[2rem] sm:mb-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="valorant-hero-banner">
        {profile.cardBannerUrl && (
          <img src={profile.cardBannerUrl} alt="" aria-hidden className="valorant-hero-banner-img" loading="lazy" decoding="async" />
        )}
        <div aria-hidden className="valorant-hero-banner-scrim" />
        <div className="valorant-hero-banner-top">
          <ValorantWordmark />
          <span className="valorant-hero-region">{profile.region.toUpperCase()}</span>
        </div>
        <div className="valorant-hero-banner-bottom">
          <p className="valorant-hero-name">
            {profile.name}
            <span>#{profile.tag}</span>
          </p>
          <span className="valorant-hero-level" aria-label={`Account level ${profile.accountLevel}`}>
            Level {profile.accountLevel}
          </span>
          <div className="valorant-hero-rank">
            {rank.tierIconUrl && (
              <img src={rank.tierIconUrl} alt="" aria-hidden className="valorant-hero-rank-icon" loading="lazy" decoding="async" />
            )}
            <div className="min-w-0 flex-1">
              <p className="valorant-hero-rank-name">
                {rank.tierName}
                {rank.leaderboardRank ? ` · #${formatNumber(rank.leaderboardRank)}` : ''}
              </p>
              <div
                className="valorant-rr-track"
                role="progressbar"
                aria-valuenow={rrPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Rank rating"
              >
                <div className="valorant-rr-fill" style={{ width: `${rrPercent}%` }} />
              </div>
              <p className="valorant-hero-rr-value">
                {rank.rr} RR
                {rank.lastChange !== 0 && (
                  <span className={rank.lastChange > 0 ? 'is-up' : 'is-down'}>
                    {rank.lastChange > 0 ? '+' : ''}
                    {rank.lastChange}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="valorant-hero-side">
        <div className="valorant-hero-act-card">
          <ValorantActHalf
            eyebrow="Current act"
            badge={actShort ? actLabel(actShort) : undefined}
            winRate={actWinRate}
            kd={actKd}
            hsPercent={actHsPercent}
            games={actGames}
            topAgent={actTopAgent}
          />
          <div className="valorant-hero-act-divider" aria-hidden />
          <ValorantActHalf
            eyebrow="Career"
            winRate={careerWinRate}
            kd={careerKd}
            hsPercent={careerHsPercent}
            games={careerMatches.length}
            topAgent={careerTopAgent}
          />
        </div>
        <div className="valorant-hero-recent-wrap">
          <p className="valorant-eyebrow">Recent games</p>
          {spotlight.length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Play a match to fill this in.</p>
          ) : (
            <ol className="valorant-hero-recent">
              {spotlight.map((match: ValorantMatch) => {
                const mapArtUrl = valorantMapArt(match.map);
                return (
                  <li
                    key={match.matchId}
                    className="valorant-hero-spotlight-card"
                    data-result={match.result}
                    data-has-art={mapArtUrl ? 'true' : undefined}
                  >
                    {mapArtUrl && <span className="valorant-hero-spotlight-art" aria-hidden style={{ backgroundImage: `url("${mapArtUrl}")` }} />}
                    {match.isMatchMvp ? (
                      <span className="valorant-hero-mvp-badge is-match">MVP</span>
                    ) : match.isTeamMvp ? (
                      <span className="valorant-hero-mvp-badge is-team">Team MVP</span>
                    ) : null}
                    {match.agentIconUrl && (
                      <img src={match.agentIconUrl} alt={match.agentName} className="valorant-hero-spotlight-agent" loading="lazy" decoding="async" />
                    )}
                    <p className="valorant-hero-spotlight-map">{match.map}</p>
                    <p className="valorant-hero-spotlight-score" aria-label={`${RESULT_LABELS[match.result]}, rounds ${match.roundsWon ?? '—'} to ${match.roundsLost ?? '—'}`}>
                      {match.roundsWon !== undefined && match.roundsLost !== undefined ? `${match.roundsWon}–${match.roundsLost}` : RESULT_LABELS[match.result]}
                    </p>
                    <p className="valorant-hero-spotlight-kda">
                      {kda(match)} <span>KDA</span>
                    </p>
                    <p className="valorant-hero-spotlight-meta">
                      {match.mode !== 'Competitive' ? `${match.mode} · ` : ''}
                      {relativeTime(match.startedAt)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </motion.section>
  );
}

export function ValorantDetail() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');
  const [selectedPeriodId, setSelectedPeriodId] = useState('two-weeks');

  return (
    <div>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => <ValorantHero data={data} />}
      </WidgetBody>

      <DetailSectionHeading label="Performance" title="Agent pool" />
      <WidgetShell title="Performance periods">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantPerformance data={data} selectedPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="History" title="Captured matches" />
      <WidgetShell title="Match history">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantMatchLog data={data} selectedPeriodId={selectedPeriodId} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
