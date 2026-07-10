import { useMemo, useState } from 'react';
import type { GitHubData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';
import { rampColor } from '../lib/contributions';

const linkClass =
  'truncate font-medium text-ink hover:underline';

export function GitHubActivityWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="GitHub activity" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className="space-y-1.5 text-sm">
          {data.activity.map((item) => (
            <li key={item.id} className="flex items-baseline gap-2">
              <span className="truncate text-ink-muted">
                {item.repo.split('/')[1] ?? item.repo}
              </span>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
                  {item.summary}
                </a>
              ) : (
                <span className="truncate">{item.summary}</span>
              )}
              <span className="ml-auto shrink-0 text-xs text-ink-faint">
                {relativeTime(item.timestamp)}
              </span>
            </li>
          ))}
          {data.activity.length === 0 && (
            <li className="text-ink-faint">No recent public activity.</li>
          )}
        </ul>
      )}
    </WidgetCard>
  );
}

export function GitHubWorkWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="PRs & issues" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-3 text-sm">
          <WorkList
            label="Open pull requests"
            empty="No open PRs."
            items={data.pullRequests.map((pr) => ({
              key: `pr-${pr.repo}-${pr.number}`,
              url: pr.url,
              title: `${pr.draft ? '(draft) ' : ''}${pr.title}`,
              meta: `${pr.repo.split('/')[1] ?? pr.repo} #${pr.number}${
                pr.role === 'review-requested' ? ' · review requested' : ''
              }`,
            }))}
          />
          <WorkList
            label="Assigned issues"
            empty="No assigned issues."
            items={data.issues.map((issue) => ({
              key: `issue-${issue.repo}-${issue.number}`,
              url: issue.url,
              title: issue.title,
              meta: `${issue.repo.split('/')[1] ?? issue.repo} #${issue.number}`,
            }))}
          />
        </div>
      )}
    </WidgetCard>
  );
}

function WorkList({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: { key: string; url: string; title: string; meta: string }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-ink-faint">{label}</h3>
      {items.length === 0 ? (
        <p className="text-ink-faint">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key} className="leading-tight">
              <a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
                {item.title}
              </a>
              <div className="text-xs text-ink-faint">{item.meta}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WEEKS_SHOWN = 26;

export function ContributionsWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  const [hovered, setHovered] = useState<{ date: string; count: number } | null>(null);

  return (
    <WidgetCard title="Contributions" envelope={envelope} offline={offline}>
      {(data) => <ContributionGrid data={data} hovered={hovered} onHover={setHovered} />}
    </WidgetCard>
  );
}

function ContributionGrid({
  data,
  hovered,
  onHover,
}: {
  data: GitHubData;
  hovered: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}) {
  const weeks = useMemo(() => {
    const all: GitHubData['contributions']['days'][] = [];
    for (let i = 0; i < data.contributions.days.length; i += 7) {
      all.push(data.contributions.days.slice(i, i + 7));
    }
    return all.slice(-WEEKS_SHOWN);
  }, [data]);

  const max = Math.max(1, ...weeks.flat().map((day) => day.count));

  return (
    <div>
      <div className="flex gap-0.5 overflow-x-auto pb-1" onMouseLeave={() => onHover(null)}>
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {week.map((day) => (
              <span
                key={day.date}
                className="block h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: rampColor(day.count, max) }}
                aria-label={`${day.date}: ${day.count} contributions`}
                onMouseEnter={() => onHover(day)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {hovered
          ? `${hovered.date} · ${hovered.count} contribution${hovered.count === 1 ? '' : 's'}`
          : `${data.contributions.total} contributions in the last year`}
      </p>
    </div>
  );
}

export function RepoHealthWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="Repos" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className="space-y-1.5 text-sm">
          {data.repoHealth.map((repo) => (
            <li key={repo.fullName} className="flex items-center gap-2">
              <a href={repo.url} target="_blank" rel="noreferrer" className={linkClass}>
                {repo.fullName.split('/')[1]}
              </a>
              {repo.latestRelease && (
                <span className="text-xs text-ink-faint">
                  {repo.latestRelease}
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-3 text-xs">
                <span className="text-ink-muted">★ {repo.stars}</span>
                <CiBadge status={repo.ciStatus} url={repo.ciUrl} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// Status colors reserved for state, shipped with icon + label, never color alone.
function CiBadge({ status, url }: { status: string; url?: string }) {
  if (status === 'none') {
    return <span className="text-ink-faint">no CI</span>;
  }
  const look =
    status === 'success'
      ? { icon: '✓', label: 'CI', color: '#0ca30c' }
      : status === 'failure'
        ? { icon: '✕', label: 'CI', color: '#d03b3b' }
        : { icon: '●', label: 'running', color: undefined };
  const badge = (
    <span className="inline-flex items-center gap-1" style={{ color: look.color }}>
      <span aria-hidden>{look.icon}</span>
      {look.label}
    </span>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
      {badge}
    </a>
  ) : (
    badge
  );
}
