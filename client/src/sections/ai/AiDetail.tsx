import type { AiUsageToolData } from '@personal-dashboard/shared';
import { relativeTime } from '../../lib/time';
import { useWidget } from '../../useWidget';
import { StaleBadge, WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { FIVE_HOUR_MS, UsageMeter, WEEKLY_MS } from './UsageMeter';
import { UsageHistoryChart } from './UsageHistoryChart';
import { AI_TOOLS } from './tools';

const DAY_MS = 24 * 60 * 60_000;

function ToolCard({ id, label, color }: Readonly<{ id: string; label: string; color: string }>) {
  const { envelope, offline } = useWidget<AiUsageToolData>(id);

  return (
    <WidgetShell title={label} badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-4">
              {data.fiveHour && (
                <UsageMeter label="5 hours" limit={data.fiveHour} color={color} windowMs={FIVE_HOUR_MS} />
              )}
              {data.weekly && (
                <UsageMeter label="Weekly" limit={data.weekly} color={color} windowMs={WEEKLY_MS} />
              )}
              <UsageHistoryChart
                points={data.history}
                metric="fiveHourUsedPercent"
                windowMs={DAY_MS}
                color={color}
                caption="5-hour window · last 24 h"
              />
              <UsageHistoryChart
                points={data.history}
                metric="weeklyUsedPercent"
                windowMs={WEEKLY_MS}
                color={color}
                caption="Weekly window · last 7 d"
              />
              {data.asOf && (
                <p className="text-[11px] text-ink-faint">As of {relativeTime(data.asOf)}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">
              No current limit snapshot available on this machine.
            </p>
          )
        }
      </WidgetBody>
    </WidgetShell>
  );
}

export function AiDetail() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {AI_TOOLS.map((tool) => (
        <ToolCard key={tool.id} {...tool} />
      ))}
    </div>
  );
}
