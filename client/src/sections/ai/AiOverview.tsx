import { motion } from 'motion/react';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { formatCompactNumber } from '../../lib/format';
import { useWidget } from '../../useWidget';
import { isWidgetDisabled, WidgetBody } from '../../components/WidgetCard';
import { WEEKLY_MS } from './UsageMeter';
import { UsageSparkline } from './UsageHistoryChart';
import { UsageRefreshButton } from './UsageRefreshButton';
import { AI_TOOLS } from './tools';
import type { ToolIconProps } from './ToolIcons';

const DAY_MS = 24 * 60 * 60_000;

function limitLabel(
  limit: AiUsageToolData['fiveHour'],
  status: AiUsageToolData['fiveHourStatus'],
  tokens?: number,
) {
  if (limit) return `${Math.round(limit.usedPercent)}%`;
  if (tokens === 0) return '0%';
  if (tokens !== undefined) return `${formatCompactNumber(tokens)} tokens`;
  return status === 'unlimited' ? 'No limit' : '—';
}

/** The bar tracks the tighter of the weekly caps (all-models vs model-specific), else the 5h window. */
function barPercent(data: AiUsageToolData) {
  if (data.weekly || data.modelWeekly) {
    return Math.max(data.weekly?.usedPercent ?? 0, data.modelWeekly?.usedPercent ?? 0);
  }
  return data.fiveHour?.usedPercent ?? 0;
}

function ToolRow({
  id,
  label,
  color,
  iconColor = color,
  icon: Icon,
}: Readonly<{ id: string; label: string; color: string; iconColor?: string; icon: React.ComponentType<ToolIconProps> }>) {
  const { envelope, offline, refresh, refreshing } = useWidget<AiUsageToolData>(id);

  if (isWidgetDisabled(envelope)) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />
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
                {data.modelWeekly && (
                  <span>
                    {data.modelWeekly.model.toLowerCase()}{' '}
                    <span className="font-semibold tabular-nums text-ink">
                      {Math.round(data.modelWeekly.usedPercent)}%
                    </span>
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-track">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${barPercent(data)}%` }}
                  style={{ backgroundColor: color }}
                />
              </div>
              {(data.fiveHour || data.weekly) && (
                <UsageSparkline
                  points={data.history}
                  metric={data.fiveHour ? 'fiveHourUsedPercent' : 'weeklyUsedPercent'}
                  windowMs={data.fiveHour ? DAY_MS : WEEKLY_MS}
                  color={color}
                />
              )}
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
