import { useMemo } from 'react';
import type { GitHubData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { rampColor } from '../../lib/contributions';
import { AnimatedNumber } from '../../components/AnimatedNumber';

const STRIP_WEEKS = 12;

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums">
        <AnimatedNumber value={value} />
      </div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}

function MiniContributionStrip({ days }: { days: GitHubData['contributions']['days'] }) {
  const weeks = useMemo(() => {
    const all: GitHubData['contributions']['days'][] = [];
    for (let i = 0; i < days.length; i += 7) {
      all.push(days.slice(i, i + 7));
    }
    return all.slice(-STRIP_WEEKS);
  }, [days]);
  const max = Math.max(1, ...weeks.flat().map((day) => day.count));

  return (
    <div className="flex gap-0.5">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {week.map((day) => (
            <span
              key={day.date}
              className="block h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: rampColor(day.count, max) }}
              aria-label={`${day.date}: ${day.count} contributions`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GitHubOverview() {
  const { envelope, offline } = useWidget<GitHubData>('github');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = data.contributions.days.at(-1);
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <Stat value={data.contributions.total} label="past year" />
              <Stat value={today?.count ?? 0} label="today" />
              <Stat value={data.pullRequests.length} label="open PRs" />
              <Stat value={data.issues.length} label="issues" />
            </div>
            <MiniContributionStrip days={data.contributions.days} />
          </div>
        );
      }}
    </WidgetBody>
  );
}
