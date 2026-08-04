import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { UsageHistoryPoint } from '@personal-dashboard/shared';

const W = 100;
const H = 32;
/** Mirrors the server's command-center reset threshold for provider reports above zero. */
const RESET_DROP_PERCENT = 40;
/** The provider's reset-deadline text only has minute-level granularity, so the same
 * still-open window's deadline can render a minute apart between two ~15-min-spaced polls
 * (e.g. "5:19pm" vs "5:20pm") — pure rounding jitter. This must stay well under the shortest
 * realistic gap between two genuinely different resets, or it'll merge them into one and drop
 * a real reset's anchor entirely. */
const RESET_DRIFT_MS = 5 * 60_000;

type Metric = 'fiveHourUsedPercent' | 'weeklyUsedPercent' | 'modelWeeklyUsedPercent';

/** Which history-point field carries a given metric's own reported reset deadline — there's no
 * per-point deadline for modelWeekly, so that metric never gets the session-reset treatment. */
const RESET_FIELD: Partial<Record<Metric, 'fiveHourResetsAt' | 'weeklyResetsAt'>> = {
  fiveHourUsedPercent: 'fiveHourResetsAt',
  weeklyUsedPercent: 'weeklyResetsAt',
};

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
  /** The zero is an observed reset, rather than a predicted reset deadline. */
  observedReset?: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Beyond a week, a weekday name alone repeats (multiple Mondays), so the date carries the
 * disambiguating info instead. */
function timeLabel(iso: string, windowMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    ...(windowMs > WEEK_MS
      ? { month: 'short' as const, day: 'numeric' as const }
      : windowMs > 24 * 60 * 60_000
        ? { weekday: 'short' as const }
        : {}),
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
    // Usage can't be sampled between the last real reading and the reset deadline, but a rate
    // limit holds the value flat until it lapses. Draw that hold dashed (it's an assumption, not
    // a sample) rather than interpolating a diagonal descent; the reset itself still lands as a
    // solid vertical drop below, and the next observed session rises normally from zero.
    if (next.sessionCapEnd) {
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
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

/**
 * A provider-reported zero after positive use, or a large downward jump, is concrete reset
 * evidence. Add the preceding value at the new sample's timestamp so the line stays level until
 * that observation, then falls vertically instead of misleadingly interpolating a gradual decline.
 *
 * This is a fallback heuristic for metrics (or gaps) with no precisely known reset deadline. When
 * `knownResets` already places one between these two samples, addSessionResetPoints draws that
 * transition exactly via the reset anchor — inserting a second, guessed duplicate here would draw
 * a redundant rise-then-drop spike at the next poll's timestamp, one the hover tie-break always
 * loses to the real reading beside it, so it renders but is never selectable.
 */
function addObservedResetPoints(chartPoints: ChartPoint[], knownResets: number[]): void {
  // Bounded to the pre-existing length: the loop pushes synthetic points onto chartPoints as it
  // goes, and `chartPoints.length` is re-read every iteration, so an unbounded loop would
  // eventually treat an earlier reset's synthetic point as a fresh neighbor of a later, unrelated
  // one — comparing their values as if adjacent in time and fabricating a bogus extra reset.
  const observedLength = chartPoints.length;
  for (let index = 1; index < observedLength; index += 1) {
    const previous = chartPoints[index - 1]!;
    const current = chartPoints[index]!;
    const drop = previous.percent - current.percent;
    const confirmedZero = previous.percent > 0 && current.percent === 0;
    if (!confirmedZero && drop < RESET_DROP_PERCENT) continue;
    const previousTime = Date.parse(previous.at);
    const currentTime = Date.parse(current.at);
    if (knownResets.some((reset) => reset > previousTime && reset <= currentTime)) continue;
    current.observedReset = true;
    chartPoints.push({
      ...previous,
      x: current.x,
      at: current.at,
      order: -1,
    });
  }
}

/** Collapse reset readings that land within RESET_DRIFT_MS of each other (they're the same
 * still-ongoing window's deadline rounding differently between polls, not separate resets),
 * keeping the latest of each. Deliberately NOT sessionWindowMs (the full 5h/7d window): two
 * genuinely distinct, consecutive resets routinely land under one window apart — a back-to-back
 * session starting shortly after the previous one resets — and a full-window threshold would
 * merge them into one, silently dropping the earlier reset's anchor from the chart. */
function clusterResets(rawResets: number[]): number[] {
  const resets: number[] = [];
  for (const reset of rawResets) {
    if (resets.length && reset - resets.at(-1)! < RESET_DRIFT_MS) {
      resets[resets.length - 1] = reset;
    } else {
      resets.push(reset);
    }
  }
  return resets;
}

/** Pushes the cap-end/reset-anchor pair for one reset timestamp, if it falls in the visible window.
 * `stablePoints` is a pre-loop snapshot so one reset's insertions can't leak into another's lookup. */
function addResetAnchor(
  chartPoints: ChartPoint[],
  stablePoints: ChartPoint[],
  reset: number,
  start: number,
  end: number,
  windowMs: number,
): void {
  if (reset <= start || reset > end) return;
  const observedZero = stablePoints.some((point) => Date.parse(point.at) === reset && point.percent === 0);
  const prior = stablePoints.findLast((point) => Date.parse(point.at) < reset);
  // Usage can't be sampled between the last real reading and the reset, but a rate limit holds
  // the value flat until it lapses — anchor the plateau at whatever was last reported (not just
  // an exact 100% cap), so e.g. a last reading of 99% holds level instead of interpolating a
  // diagonal descent toward the reset's zero.
  if (prior && prior.percent > 0) {
    chartPoints.push({
      x: ((reset - start) / windowMs) * W,
      y: H - (prior.percent / 100) * H,
      at: new Date(reset).toISOString(),
      percent: prior.percent,
      order: 1,
      sessionCapEnd: true,
    });
  }
  if (!observedZero) {
    chartPoints.push({
      x: ((reset - start) / windowMs) * W,
      y: H,
      at: new Date(reset).toISOString(),
      percent: 0,
      order: 2,
      resetAnchor: true,
    });
  }
}

/** Resolves the known reset deadlines for one metric, clustering close-together reports of the
 * same still-ongoing window into a single event (see clusterResets). Empty for a metric with no
 * resetField (modelWeekly) — those fall back entirely to addObservedResetPoints' heuristic. */
function computeKnownResets(
  points: UsageHistoryPoint[],
  resetField: 'fiveHourResetsAt' | 'weeklyResetsAt' | undefined,
  sessionResetsAt: string | undefined,
  sessionWindowMs: number | undefined,
): number[] {
  if (!resetField || !sessionWindowMs) return [];
  const rawResets = [
    ...points.map((point) => point[resetField]).filter((reset): reset is string => Boolean(reset)),
    sessionResetsAt,
  ]
    .filter((reset): reset is string => Boolean(reset))
    .map((reset) => Date.parse(reset))
    .filter((reset) => Number.isFinite(reset))
    .sort((a, b) => a - b);
  // The provider's reported reset deadline can drift a little from poll to poll (it reflects the
  // live rolling window, not a fixed boundary); collapse those into one event per real reset.
  return clusterResets(rawResets);
}

/** Splices the synthetic reset/session-start markers (see ChartPoint) into chartPoints in place,
 * one set per known reset timestamp within the visible window.
 *
 * `includeSessionStart` gates only the "fresh session began at 0%" marker, not the reset-anchor
 * itself. That marker is derived by subtracting a full window from a reset deadline — a reliable
 * guess for the five-hour quota, which genuinely resets on close to a fixed cadence, but not for
 * the weekly quota: real usage doesn't align to a 7-day grid, so the same subtraction can land
 * over an hour off the actual reset, drawing a false plateau/decline across a real one. The
 * reset-anchor itself doesn't have this problem — it uses each sample's own reported deadline
 * directly, no backdating involved — so it's precise for both metrics. */
function addSessionResetPoints(
  chartPoints: ChartPoint[],
  resets: number[],
  sessionWindowMs: number,
  includeSessionStart: boolean,
  start: number,
  end: number,
  windowMs: number,
): void {
  // Snapshot before mutating: without this, an earlier reset's synthetic insertions (pushed onto
  // chartPoints below) could be picked up as a *later* reset's "prior" sample, since they're
  // appended out of chronological order.
  const stablePoints = [...chartPoints];
  for (const reset of resets) {
    addResetAnchor(chartPoints, stablePoints, reset, start, end, windowMs);
    if (!includeSessionStart) continue;
    const sessionStart = reset - sessionWindowMs;
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
    chartPoints.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const resetField = RESET_FIELD[metric];
    const resets = computeKnownResets(points, resetField, sessionResetsAt, sessionWindowMs);
    addObservedResetPoints(chartPoints, resets);
    if (sessionWindowMs && resetField) {
      addSessionResetPoints(chartPoints, resets, sessionWindowMs, metric === 'fiveHourUsedPercent', start, end, windowMs);
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

  let captionText = caption;
  if (hovered) {
    const resetSuffix = hovered.sessionStart || hovered.observedReset || hovered.resetAnchor ? ' · reset' : '';
    captionText = `${Math.round(hovered.percent)}% · ${timeLabel(hovered.at, windowMs)}${resetSuffix}`;
  }

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    setHovered(
      // On an exact tie (e.g. the synthetic pre-reset duplicate and the flagged real sample
      // that follows it share the drop's x-coordinate), prefer the later point: chartPoints is
      // sorted with the reset-flagged sample after its synthetic predecessor, so `<=` surfaces
      // the reset instead of silently reporting the stale pre-reset value.
      chartPoints.reduce((best, point) =>
        Math.abs(point.x - x) <= Math.abs(best.x - x) ? point : best,
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
              key={`${point.at}-${point.order ?? 0}`}
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
      <p className="mt-1 text-[11px] tabular-nums text-ink-faint">{captionText}</p>
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
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full overflow-visible" aria-hidden>
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
          key={`${point.at}-${point.order ?? 0}`}
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
