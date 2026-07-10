import { useState } from 'react';
import type { AiUsageData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

// Categorical slots 1 (blue) and 2 (aqua), stepped per color mode.
const TOOL_META = {
  claude: { label: 'Claude Code', color: 'light-dark(#2a78d6, #3987e5)' },
  codex: { label: 'Codex', color: 'light-dark(#1baf7a, #199e70)' },
} as const;

const money = (value: number) => `$${value.toFixed(2)}`;

const compactTokens = (value: number) =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const shortModel = (name: string) => name.replace(/^claude-/, '');

export function AiUsageWidget() {
  const { envelope, offline } = useWidget<AiUsageData>('ai-usage');
  const [hovered, setHovered] = useState<{ date: string; cost: number } | null>(null);

  return (
    <WidgetCard title="AI usage" envelope={envelope} offline={offline}>
      {(data) => {
        const maxCost = Math.max(
          0.01,
          ...data.tools.flatMap((tool) => tool.days.map((day) => day.cost)),
        );
        const shown = data.tools.filter((tool) => tool.available);
        if (shown.length === 0) {
          return (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No Claude Code or Codex usage found on this machine.
            </p>
          );
        }
        return (
          <div className="space-y-4">
            {shown.map((tool) => (
              <div key={tool.tool}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TOOL_META[tool.tool].color }}
                  />
                  <span className="font-medium">{TOOL_META[tool.tool].label}</span>
                  <span className="ml-auto tabular-nums">
                    <span className="font-semibold">{money(tool.today.cost)}</span>
                    <span className="text-slate-400 dark:text-slate-500"> today · </span>
                    {money(tool.week.cost)}
                    <span className="text-slate-400 dark:text-slate-500"> this week</span>
                  </span>
                </div>
                <Sparkline
                  days={tool.days}
                  max={maxCost}
                  color={TOOL_META[tool.tool].color}
                  onHover={setHovered}
                />
                <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                  {tool.models
                    .slice(0, 3)
                    .map(
                      (model) =>
                        `${shortModel(model.name)} ${
                          model.cost !== undefined
                            ? money(model.cost)
                            : compactTokens(model.tokens)
                        }`,
                    )
                    .join(' · ')}
                </p>
              </div>
            ))}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {hovered
                ? `${hovered.date} · ${money(hovered.cost)}`
                : 'Estimated API-equivalent cost, last 14 days — not actual spend.'}
            </p>
          </div>
        );
      }}
    </WidgetCard>
  );
}

const BAR = 6;
const GAP = 2;
const HEIGHT = 28;

function Sparkline({
  days,
  max,
  color,
  onHover,
}: {
  days: { date: string; cost: number }[];
  max: number;
  color: string;
  onHover: (day: { date: string; cost: number } | null) => void;
}) {
  const width = days.length * (BAR + GAP) - GAP;
  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      className="mt-1 h-7 w-full max-w-56"
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily cost, last 14 days"
      onMouseLeave={() => onHover(null)}
    >
      {days.map((day, i) => {
        const barHeight = day.cost === 0 ? 0 : Math.max(2, (day.cost / max) * HEIGHT);
        return (
          <g key={day.date} onMouseEnter={() => onHover(day)}>
            {/* full-height hit target so hover beats the thin mark */}
            <rect x={i * (BAR + GAP)} y={0} width={BAR + GAP} height={HEIGHT} fill="transparent" />
            <rect
              x={i * (BAR + GAP)}
              y={HEIGHT - Math.max(barHeight, 1)}
              width={BAR}
              height={Math.max(barHeight, 1)}
              rx={1}
              style={{ fill: color, opacity: day.cost === 0 ? 0.25 : 1 }}
            />
          </g>
        );
      })}
    </svg>
  );
}
