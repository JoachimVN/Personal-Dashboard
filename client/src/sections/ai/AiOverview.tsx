import { motion } from 'motion/react';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { formatCompactNumber } from '../../lib/format';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { UsageSparkline } from './UsageHistoryChart';
import { UsageRefreshButton } from './UsageRefreshButton';
import { AI_TOOLS } from './tools';

const DAY_MS = 24 * 60 * 60_000;

function limitLabel(
  limit: AiUsageToolData['fiveHour'],
  status: AiUsageToolData['fiveHourStatus'],
  tokens?: number,
) {
  if (limit) return `${Math.round(limit.usedPercent)}%`;
  if (tokens !== undefined) return `${formatCompactNumber(tokens)} tok`;
  return status === 'unlimited' ? 'No limit' : '—';
}

function ToolRow({ id, label, color }: Readonly<{ id: string; label: string; color: string }>) {
  const { envelope, offline, refresh, refreshing } = useWidget<AiUsageToolData>(id);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium">{label}</span>
        <span className="ml-auto">
          <UsageRefreshButton label={label} refreshing={refreshing} onRefresh={refresh} />
        </span>
      </div>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-xs text-ink-muted">
                <span>
                  5h{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {limitLabel(data.fiveHour, data.fiveHourStatus, data.tokens?.fiveHour)}
                  </span>
                </span>
                <span>
                  week{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {limitLabel(data.weekly, data.weeklyStatus, data.tokens?.weekly)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-track">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${data.weekly?.usedPercent ?? data.fiveHour?.usedPercent ?? 0}%`,
                  }}
                  style={{ backgroundColor: color }}
                />
              </div>
              <UsageSparkline
                points={data.history}
                metric="fiveHourUsedPercent"
                windowMs={DAY_MS}
                color={color}
              />
              {data.tokens && (
                <div className="flex items-baseline justify-between pt-0.5 text-[11px] text-ink-faint">
                  <span>tokens used</span>
                  <span className="font-medium tabular-nums text-ink-muted">
                    5h {formatCompactNumber(data.tokens.fiveHour)} · week {formatCompactNumber(data.tokens.weekly)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No snapshot on this machine.</p>
          )
        }
      </WidgetBody>
    </div>
  );
}

export function AiOverview() {
  return (
    <div className="space-y-4">
      {AI_TOOLS.map((tool) => (
        <ToolRow key={tool.id} {...tool} />
      ))}
    </div>
  );
}
