export function ValorantRankProgress({
  rr,
  lastChange,
  className = '',
}: Readonly<{ rr: number; lastChange: number; className?: string }>) {
  return <div className={`command-valorant-rank-progress ${className}`.trim()}>
    <div><span>{rr} RR</span>{lastChange !== 0 && <em className={lastChange > 0 ? 'is-up' : 'is-down'}>{lastChange > 0 ? '+' : ''}{lastChange}</em>}</div>
    <progress value={rr} max={100} aria-label={`${rr} of 100 rank rating`} />
  </div>;
}
