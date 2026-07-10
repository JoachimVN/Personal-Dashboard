import { motion } from 'motion/react';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { AI_TOOLS } from './tools';

function ToolRow({ id, label, color }: Readonly<{ id: string; label: string; color: string }>) {
  const { envelope, offline } = useWidget<AiUsageToolData>(id);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium">{label}</span>
      </div>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-xs text-ink-muted">
                <span>
                  5h{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {data.fiveHour ? `${Math.round(data.fiveHour.usedPercent)}%` : '—'}
                  </span>
                </span>
                <span>
                  week{' '}
                  <span className="font-semibold tabular-nums text-ink">
                    {data.weekly ? `${Math.round(data.weekly.usedPercent)}%` : '—'}
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
