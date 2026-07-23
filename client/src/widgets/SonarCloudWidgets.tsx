import type { SonarProject, SonarRating } from '@personal-dashboard/shared';

const RATING_COLOR: Record<SonarRating, string> = {
  A: 'light-dark(#1c7a3d, #4ade80)',
  B: 'light-dark(#4d8c1f, #a3e635)',
  C: 'light-dark(#b58900, #facc15)',
  D: 'light-dark(#c2600a, #fb923c)',
  E: 'light-dark(#b91c1c, #fb7185)',
};

function RatingBadge({ rating, label, value }: Readonly<{ rating?: SonarRating; label: string; value?: string }>) {
  const color = rating ? RATING_COLOR[rating] : 'var(--color-ink-faint)';
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: rating ? color : 'var(--color-track)', color: rating ? undefined : 'var(--color-ink-faint)' }}
      >
        {rating ?? '–'}
      </span>
      <span className="text-sm font-semibold tabular-nums text-ink">{value ?? '–'}</span>
      <span className="text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{label}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatLoc(loc: number | undefined): string {
  if (loc === undefined) return '0';
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
}

export function SonarProjectCard({ project }: Readonly<{ project: SonarProject }>) {
  const { lastAnalysis } = project;
  return (
    <a
      href={`https://sonarcloud.io/project/overview?id=${encodeURIComponent(project.key)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-(--color-card-border) bg-track/15 p-4 transition-colors hover:bg-track/25 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-base font-semibold text-ink">{project.name}</p>
          <span className="shrink-0 rounded-full border border-(--color-card-border) px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            {project.visibility}
          </span>
        </div>
        {project.qualityGateStatus !== 'none' && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: project.qualityGateStatus === 'passed' ? 'light-dark(#0a7a3d, #4ade80)' : 'light-dark(#b91c1c, #fb7185)',
              background: project.qualityGateStatus === 'passed' ? 'color-mix(in oklab, #22c55e 18%, transparent)' : 'color-mix(in oklab, #ef4444 18%, transparent)',
            }}
          >
            {project.qualityGateStatus === 'passed' ? '✓ Passed' : '✕ Failed'}
          </span>
        )}
      </div>
      {lastAnalysis ? (
        <>
          <p className="mt-2 text-xs text-ink-faint">
            Last analysis: {formatDate(lastAnalysis)} · <span className="font-semibold text-ink-muted">{formatLoc(project.linesOfCode)}</span> Lines of Code
            {project.languages.length > 0 && ` · ${project.languages.join(', ')}`}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-(--color-card-border) pt-4 sm:grid-cols-6">
            <RatingBadge rating={project.security} label="Security" />
            <RatingBadge rating={project.reliability} label="Reliability" />
            <RatingBadge rating={project.maintainability} label="Maintainability" />
            <RatingBadge label="Hotspots Reviewed" value={project.hotspotsReviewedPercent !== undefined ? `${project.hotspotsReviewedPercent.toFixed(0)}%` : undefined} />
            <RatingBadge label="Coverage" value={project.coveragePercent !== undefined ? `${project.coveragePercent.toFixed(1)}%` : '–'} />
            <RatingBadge label="Duplications" value={project.duplicationsPercent !== undefined ? `${project.duplicationsPercent.toFixed(1)}%` : '0.0%'} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-ink-faint">No analysis yet</p>
      )}
    </a>
  );
}
