import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { UsageHistoryPoint } from '@personal-dashboard/shared';

const W = 100;
const H = 32;

type Metric = 'fiveHourUsedPercent' | 'weeklyUsedPercent';

interface ChartPoint {
  x: number;
  y: number;
  at: string;
  percent: number;
}

function timeLabel(iso: string, windowMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    ...(windowMs > 24 * 60 * 60_000 ? { weekday: 'short' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function useChartPoints(points: UsageHistoryPoint[], metric: Metric, windowMs: number) {
  return useMemo(() => {
    const end = Date.now();
    const start = end - windowMs;
    return points
      .filter((point) => point[metric] !== undefined && Date.parse(point.at) >= start)
      .map((point): ChartPoint => {
        const percent = point[metric]!;
        return {
          x: ((Date.parse(point.at) - start) / windowMs) * W,
          y: H - (percent / 100) * H,
          at: point.at,
          percent,
        };
      });
  }, [points, metric, windowMs]);
}

/**
 * Single-series area trend of one usage metric over a rolling window. The y scale is the
 * fixed 0–100% allowance. Tap/hover reads out the nearest sample in the caption line.
 */
export function UsageHistoryChart({
  points,
  metric,
  windowMs,
  color,
  caption,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
  caption: string;
}>) {
  const chartPoints = useChartPoints(points, metric, windowMs);
  const [hovered, setHovered] = useState<ChartPoint | null>(null);

  if (chartPoints.length < 2) {
    return <p className="text-[11px] text-ink-faint">{caption} — collecting history…</p>;
  }

  const line = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${chartPoints.at(-1)!.x},${H} L${chartPoints[0].x},${H} Z`;

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    setHovered(
      chartPoints.reduce((best, point) =>
        Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best,
      ),
    );
  };

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-16 w-full touch-none"
          aria-label={`${caption}: ${chartPoints.length} samples, currently ${Math.round(chartPoints.at(-1)!.percent)}%`}
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => setHovered(null)}
        >
          {/* Recessive 100% / 50% / baseline hairlines */}
          {[0, H / 2, H].map((y) => (
            <line
              key={y}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              stroke="var(--color-card-border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={color} opacity={0.15} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        {hovered && (
          <span
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(hovered.x / W) * 100}%`,
              top: `${(hovered.y / H) * 100}%`,
              background: color,
              boxShadow: '0 0 0 2px var(--color-canvas)',
            }}
          />
        )}
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-ink-faint">
        {hovered
          ? `${Math.round(hovered.percent)}% · ${timeLabel(hovered.at, windowMs)}`
          : caption}
      </p>
    </div>
  );
}

/** Tiny non-interactive trend line for overview blocks. */
export function UsageSparkline({
  points,
  metric,
  windowMs,
  color,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
}>) {
  const chartPoints = useChartPoints(points, metric, windowMs);
  if (chartPoints.length < 2) return null;

  const line = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.8}
      />
    </svg>
  );
}
