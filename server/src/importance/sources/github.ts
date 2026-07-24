import type { GitHubData } from '@personal-dashboard/shared';

import { computeDeviation } from '../../deviation.js';
import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

export function githubCandidates(
  data: GitHubData | undefined,
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  if (!data) return [];
  const reviews = data.pullRequests.filter((pr) => pr.role === 'review-requested');
  const days = data.contributions.days;
  const today = days.at(-1)?.count ?? 0;
  const candidates: Candidate[] = [];
  if (reviews.length) {
    candidates.push({
      id: `github:review:${reviews[0].repo}:${reviews[0].number}`, source: 'github', kind: 'github', score: 91,
      shapes: [...allShapes], kicker: reviews.length > 1 ? `${reviews.length} reviews waiting` : 'Review requested',
      title: reviews[0].title, detail: reviews[0].repo, href: '#/github', render: { type: 'github-reviews' },
    });
  }
  // Only an unusually HIGH day is a signal — a quiet day isn't a "code anomaly" worth surfacing.
  const priorCounts = days.slice(-(baselineWindowDays + 1), -1).map((day) => day.count);
  const deviation = computeDeviation(today, priorCounts, baselineDeviationPercent);
  if (deviation?.anomalous && deviation.direction === 'above') {
    candidates.push({
      id: 'github:contributions-anomaly', source: 'github', kind: 'github', score: 80, shapes: [...allShapes],
      kicker: 'Big day on GitHub', title: `${today} contributions today`,
      detail: `${deviation.deviationPercent.toFixed(0)}% above your usual ${deviation.average.toFixed(1)}/day`,
      href: '#/github', render: { type: 'github-contributions' },
    });
  }
  if (today > 0) {
    candidates.push({
      id: 'github:contributions', source: 'github', kind: 'github', score: 36,
      shapes: ['tile'], kicker: 'This week on GitHub',
      title: `${today} contribution${today === 1 ? '' : 's'} today`,
      detail: `${data.pullRequests.length} open pull requests`, href: '#/github', render: { type: 'github-contributions' },
    });
  } else {
    const recentWeek = days.slice(-7).reduce((total, day) => total + day.count, 0);
    if (recentWeek > 0) {
      candidates.push({
        id: 'github:recent-contributions', source: 'github', kind: 'github', score: 27, shapes: ['tile'],
        kicker: 'This week on GitHub', title: `${recentWeek} contribution${recentWeek === 1 ? '' : 's'} this week`,
        detail: 'Your recent contribution history', href: '#/github', render: { type: 'github-contributions' },
      });
    }
  }
  return candidates;
}
