import type { AiUsageToolData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetBody, WidgetShell } from '../components/WidgetCard';

function resetLabel(resetsAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resetsAt));
}

/** Fraction of the rolling window elapsed, assuming resetsAt = window start + durationMs. */
function paceElapsedPercent(resetsAt: string, durationMs: number) {
  const remainingMs = new Date(resetsAt).getTime() - Date.now();
  const elapsedMs = durationMs - remainingMs;
  return Math.max(0, Math.min(100, (elapsedMs / durationMs) * 100));
}

const FIVE_HOUR_MS = 5 * 60 * 60_000;
const WEEKLY_MS = 7 * 24 * 60 * 60_000;

function LimitRow({
  label,
  limit,
  color,
  windowMs,
}: Readonly<{
  label: string;
  limit: NonNullable<AiUsageToolData['fiveHour']>;
  color: string;
  windowMs: number;
}>) {
  const pace = paceElapsedPercent(limit.resetsAt, windowMs);
  const aheadOfPace = limit.usedPercent > pace;

  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">{Math.round(limit.usedPercent)}%</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${limit.usedPercent}%`, backgroundColor: color }}
        />
        <div
          className="absolute top-0 h-full w-px"
          title={aheadOfPace ? 'Ahead of pace for this window' : 'On track for this window'}
          style={{
            left: `${pace}%`,
            backgroundColor: aheadOfPace ? '#f59e0b' : 'rgba(148, 163, 184, 0.6)',
          }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        Resets {resetLabel(limit.resetsAt)}
      </p>
    </div>
  );
}

function ToolSection({
  id,
  label,
  color,
}: Readonly<{ id: string; label: string; color: string }>) {
  const { envelope, offline } = useWidget<AiUsageToolData>(id);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium">{label}</span>
      </div>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="grid grid-cols-2 gap-3">
              {data.fiveHour && (
                <LimitRow label="5 hours" limit={data.fiveHour} color={color} windowMs={FIVE_HOUR_MS} />
              )}
              {data.weekly && <LimitRow label="Weekly" limit={data.weekly} color={color} windowMs={WEEKLY_MS} />}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No current limit snapshot available on this machine.
            </p>
          )
        }
      </WidgetBody>
    </section>
  );
}

export function AiUsageWidget() {
  return (
    <WidgetShell title="AI usage">
      <div className="space-y-4">
        <ToolSection id="ai-usage-claude" label="Claude Code" color="light-dark(#2a78d6, #3987e5)" />
        <ToolSection id="ai-usage-codex" label="Codex" color="light-dark(#1baf7a, #199e70)" />
      </div>
    </WidgetShell>
  );
}
