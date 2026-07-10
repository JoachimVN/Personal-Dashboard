import type { AiUsageData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

const TOOL_META = {
  claude: { label: 'Claude Code', color: 'light-dark(#2a78d6, #3987e5)' },
  codex: { label: 'Codex', color: 'light-dark(#1baf7a, #199e70)' },
} as const;

function resetLabel(resetsAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resetsAt));
}

function LimitRow({
  label,
  limit,
  color,
}: Readonly<{
  label: string;
  limit: NonNullable<AiUsageData['tools'][number]['fiveHour']>;
  color: string;
}>) {
  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">{Math.round(limit.usedPercent)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${limit.usedPercent}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        Resets {resetLabel(limit.resetsAt)}
      </p>
    </div>
  );
}

export function AiUsageWidget() {
  const { envelope, offline } = useWidget<AiUsageData>('ai-usage');

  return (
    <WidgetCard title="AI usage" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-4">
          {data.tools.map((tool) => (
            <section key={tool.tool}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TOOL_META[tool.tool].color }}
                />
                <span className="font-medium">{TOOL_META[tool.tool].label}</span>
              </div>
              {tool.available ? (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {tool.fiveHour && (
                    <LimitRow label="5 hours" limit={tool.fiveHour} color={TOOL_META[tool.tool].color} />
                  )}
                  {tool.weekly && (
                    <LimitRow label="Weekly" limit={tool.weekly} color={TOOL_META[tool.tool].color} />
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  No current limit snapshot available on this machine.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
