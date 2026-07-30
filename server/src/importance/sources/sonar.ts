import type { SonarCloudData } from '@personal-dashboard/shared';
import type { Candidate, SonarMoments } from '../types.js';
import { allShapes } from './shapes.js';

/**
 * SonarCloud quality gate transitions detected since the last poll (see computeSonarMoments in
 * commandCenter.ts). A newly-failed gate is a regression worth acting on; a newly-passed one is
 * lower-priority good news, so the two get very different scores.
 */
export function sonarCandidates(data: SonarCloudData | undefined, moments: SonarMoments): Candidate[] {
  if (!data) return [];
  const failed = moments.changed.filter((change) => change.status === 'failed');
  const passed = moments.changed.filter((change) => change.status === 'passed');
  const candidates: Candidate[] = [];
  if (failed.length) {
    candidates.push({
      id: `sonar:failed:${failed[0].projectKey}`, source: 'sonar', kind: 'sonar', score: 78, shapes: [...allShapes],
      kicker: failed.length > 1 ? `${failed.length} quality gates failed` : 'Quality gate failed',
      title: failed[0].projectName, detail: 'SonarCloud', href: '#/github',
      render: { type: 'sonar-quality-gate', status: 'failed', projects: failed.map((change) => ({ key: change.projectKey, name: change.projectName })) },
    });
  }
  if (passed.length) {
    candidates.push({
      id: `sonar:passed:${passed[0].projectKey}`, source: 'sonar', kind: 'sonar', score: 42, shapes: ['tile'],
      kicker: passed.length > 1 ? `${passed.length} quality gates passed` : 'Quality gate passed',
      title: passed[0].projectName, detail: 'SonarCloud', href: '#/github',
      render: { type: 'sonar-quality-gate', status: 'passed', projects: passed.map((change) => ({ key: change.projectKey, name: change.projectName })) },
    });
  }
  return candidates;
}
