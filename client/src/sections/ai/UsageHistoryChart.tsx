import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { UsageHistoryPoint } from '@personal-dashboard/shared';

const W = 100;
const H = 32;

type Metric = 'fiveHourUsedPercent' | 'weeklyUsedPercent' | 'modelWeeklyUsedPercent';

interface ChartPoint {
  x: number;
  y: number;
  at: string;
  percent: number;
  /** Sort same-timestamp synthetic reset points in their visual event order. */
  order?: number;
  /** Synthetic 100% endpoint immediately before a known allowance reset. */
  sessionCapEnd?: boolean;
  /** Synthetic zero at a reset deadline observed in a historical sample. */
  resetAnchor?: boolean;
  /** Synthetic zero at the start of a newly-reset rolling allowance. */
  sessionStart?: boolean;
}

function timeLabel(iso: string, windowMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    ...(windowMs > 24 * 60 * 60_000 ? { weekday: 'short' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface ChartGeometry {
  points: ChartPoint[];
  /** Line through runs of normally-spaced samples (may hold several M subpaths). */
  solidPath: string;
  /** Fill under the solid runs only, so gaps don't read as recorded usage. */
  areaPath: string;
  /** Dashed joins across sampling gaps (server asleep / dashboard off). */
  gapPath: string;
  /** Samples with a gap on both sides — invisible without their own mark. */
  dots: ChartPoint[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Same approach as the health trend charts: samples arrive on a steady cadence while the server
 * is up, so a spacing well beyond the typical interval means missing data — join it with a
 * dashed segment instead of implying a solid recorded line. The threshold adapts to the data
 * (3× the median spacing) since the client doesn't know the server's sampling config.
 */
function buildGeometry(chartPoints: ChartPoint[]): ChartGeometry {
  const times = chartPoints.map((point) => Date.parse(point.at));
  const deltas = times.slice(1).map((time, i) => time - times[i]);
  const gapMs = median(deltas) * 3;

  const runs: ChartPoint[][] = [[chartPoints[0]]];
  const gapJoins: Array<{ from: ChartPoint; to: ChartPoint }> = [];
  deltas.forEach((delta, i) => {
    const next = chartPoints[i + 1];
    // A confirmed capped session remains at 100% until its reset. Keep that plateau and draw the
    // reset as a vertical drop; the next observed session can then rise normally from zero.
    if (next.sessionCapEnd) {
      runs.at(-1)!.push(next);
      return;
    }
    if (next.resetAnchor) {
      if (runs.at(-1)!.at(-1)!.sessionCapEnd) {
        runs.at(-1)!.push(next);
        return;
      }
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
      return;
    }
    // A rolling allowance reset is an explicitly known endpoint, but the path leading to it was
    // not sampled. Draw that descent dashed rather than leaving a misleading blank space or a
    // solid interpolation; the next run rises normally from the known 0% session start.
    if (next.sessionStart) {
      if (runs.at(-1)!.at(-1)!.resetAnchor) {
        runs.at(-1)!.push(next);
        return;
      }
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
      return;
    }
    // The first observed point after a reset belongs to the zero anchor even if the dashboard
    // did not sample immediately. That slope represents known within-session accumulation.
    if (delta > gapMs && !runs.at(-1)![0].sessionStart) {
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([]);
    }
    runs.at(-1)!.push(chartPoints[i + 1]);
  });

  const solidRuns = runs.filter((run) => run.length > 1);
  const runLine = (run: ChartPoint[]) =>
    run.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return {
    points: chartPoints,
    solidPath: solidRuns.map(runLine).join(' '),
    areaPath: solidRuns
      .map((run) => `${runLine(run)} L${run.at(-1)!.x},${H} L${run[0].x},${H} Z`)
      .join(' '),
    gapPath: gapJoins
      .map(({ from, to }) => `M${from.x},${from.y} L${to.x},${to.y}`)
      .join(' '),
    dots: runs.filter((run) => run.length === 1).map((run) => run[0]),
  };
}

function useChartGeometry(
  points: UsageHistoryPoint[],
  metric: Metric,
  windowMs: number,
  sessionResetsAt?: string,
  sessionWindowMs?: number,
) {
  return useMemo(() => {
    const end = Date.now();
    const start = end - windowMs;
    const chartPoints = points
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
    if (sessionWindowMs) {
      const resets = new Set([
        ...points.map((point) => point.fiveHourResetsAt).filter((reset): reset is string => Boolean(reset)),
        sessionResetsAt,
      ].filter((reset): reset is string => Boolean(reset)));
      for (const resetAt of resets) {
        const reset = Date.parse(resetAt);
        if (!Number.isFinite(reset)) continue;
        const sessionStart = reset - sessionWindowMs;
        if (reset > start && reset <= end) {
          const prior = chartPoints.filter((point) => Date.parse(point.at) < reset).at(-1);
          if (prior?.percent === 100) {
            chartPoints.push({
              x: ((reset - start) / windowMs) * W,
              y: 0,
              at: new Date(reset).toISOString(),
              percent: 100,
              order: 1,
              sessionCapEnd: true,
            });
          }
          chartPoints.push({
            x: ((reset - start) / windowMs) * W,
            y: H,
            at: new Date(reset).toISOString(),
            percent: 0,
            order: 2,
            resetAnchor: true,
          });
        }
        if (sessionStart <= start || sessionStart > end) continue;
        chartPoints.push({
          x: ((sessionStart - start) / windowMs) * W,
          y: H,
          at: new Date(sessionStart).toISOString(),
          percent: 0,
          order: 2,
          sessionStart: true,
        });
      }
    }
    chartPoints.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.order ?? 0) - (b.order ?? 0));
    return chartPoints.length < 2 ? null : buildGeometry(chartPoints);
  }, [points, metric, windowMs, sessionResetsAt, sessionWindowMs]);
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
  sessionResetsAt,
  sessionWindowMs,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
  caption: string;
  /** Current rolling-window deadline; used to anchor a known reset at 0%. */
  sessionResetsAt?: string;
  sessionWindowMs?: number;
}>) {
  const geometry = useChartGeometry(points, metric, windowMs, sessionResetsAt, sessionWindowMs);
  const [hovered, setHovered] = useState<ChartPoint | null>(null);

  if (!geometry) {
    return <p className="text-[11px] text-ink-faint">{caption} — collecting history…</p>;
  }
  const chartPoints = geometry.points;

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
          className="h-16 w-full touch-none overflow-visible"
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
          {geometry.areaPath && <path d={geometry.areaPath} fill={color} opacity={0.15} />}
          {geometry.gapPath && (
            <motion.path
              d={geometry.gapPath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="3 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
          {geometry.solidPath && (
            <motion.path
              d={geometry.solidPath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              // Not a pathLength draw-on: framer's end state keeps a normalized dasharray
              // (dash 1 / gap 1) on the path, which Chrome mis-scales under
              // non-scaling-stroke and leaves chunks of the line unpainted.
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
          {geometry.dots.map((point) => (
            <path
              key={point.at}
              // A zero-length round-capped stroke renders as a circular dot even
              // though preserveAspectRatio="none" would distort a <circle>.
              d={`M${point.x},${point.y} l0.01,0`}
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
          ? `${Math.round(hovered.percent)}% · ${timeLabel(hovered.at, windowMs)}${hovered.sessionStart ? ' · session reset' : ''}`
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
  sessionResetsAt,
  sessionWindowMs,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
  sessionResetsAt?: string;
  sessionWindowMs?: number;
}>) {
  const geometry = useChartGeometry(points, metric, windowMs, sessionResetsAt, sessionWindowMs);
  if (!geometry) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full overflow-visible" aria-hidden>
      {geometry.gapPath && (
        <path
          d={geometry.gapPath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.5}
        />
      )}
      {geometry.solidPath && (
        <path
          d={geometry.solidPath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
      )}
      {geometry.dots.map((point) => (
        <path
          key={point.at}
          d={`M${point.x},${point.y} l0.01,0`}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
      ))}
    </svg>
  );
}
