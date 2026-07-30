import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@personal-dashboard/shared';

/** Same pass/fail pill treatment as SonarProjectCard, so a quality-gate moment reads consistently
 * whether it's seen on the command center or the Code quality detail section. */
function QualityGatePill({ status }: Readonly<{ status: 'passed' | 'failed' }>): ReactNode {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        color: status === 'passed' ? 'light-dark(#0a7a3d, #4ade80)' : 'light-dark(#b91c1c, #fb7185)',
        background: status === 'passed' ? 'color-mix(in oklab, #22c55e 18%, transparent)' : 'color-mix(in oklab, #ef4444 18%, transparent)',
      }}
    >
      {status === 'passed' ? '✓ Passed' : '✕ Failed'}
    </span>
  );
}

export function SonarQualityGateSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'sonar-quality-gate') return null;
  const { status, projects } = slot.render;
  const rest = projects.slice(1);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <QualityGatePill status={status} />
        <span className="text-sm font-semibold text-ink">{projects[0].name}</span>
      </div>
      {rest.length > 0 && (
        <div className="command-agenda-list mt-3">
          {rest.map((project) => (
            <div key={project.key} className="command-agenda-item">
              <span className="command-agenda-lead">SonarCloud</span><span>{project.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
