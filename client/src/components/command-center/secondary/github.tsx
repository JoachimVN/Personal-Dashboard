import type { ReactNode } from 'react';
import type { CommandCenterSlot, GitHubData } from '@personal-dashboard/shared';
import { ContributionGrid } from '../../../widgets/GitHubWidgets';

export function GithubContributionsSecondary({
  slot,
  github,
  hoveredDay,
  onHover,
}: Readonly<{
  slot: CommandCenterSlot;
  github: GitHubData | undefined;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  if (slot.render.type !== 'github-contributions' || !github) return null;
  return <div className="mt-4"><ContributionGrid data={github} hovered={hoveredDay} onHover={onHover} /></div>;
}

export function GithubReviewList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested').slice(skip, skip + 4) ?? [];
  if (!reviews.length) return null;
  return <div className="command-agenda-list mt-4">
    {reviews.map((pr) => <div key={`${pr.repo}#${pr.number}`} className="command-agenda-item">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </div>)}
  </div>;
}

export function GithubReviewsSecondary({ slot, github }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined }>): ReactNode {
  if (slot.render.type !== 'github-reviews') return null;
  return GithubReviewList({ github });
}

export function GithubOpenPrList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const openPrs = github?.pullRequests.filter((pr) => pr.role === 'author' && !pr.draft).slice(skip, skip + 4) ?? [];
  if (!openPrs.length) return null;
  return <div className="command-agenda-list mt-4">
    {openPrs.map((pr) => <div key={`${pr.repo}#${pr.number}`} className="command-agenda-item">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </div>)}
  </div>;
}

export function GithubOpenPrsSecondary({ slot, github }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined }>): ReactNode {
  if (slot.render.type !== 'github-open-prs') return null;
  return GithubOpenPrList({ github });
}
