import { motion } from 'motion/react';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { formatCompactNumber } from '../../lib/format';

export const FIVE_HOUR_MS = 5 * 60 * 60_000;
export const WEEKLY_MS = 7 * 24 * 60 * 60_000;

export type RateLimit = NonNullable<AiUsageToolData['fiveHour']>;

function resetLabel(resetsAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resetsAt));
}

/** Fraction of the rolling window elapsed, assuming resetsAt = window start + durationMs. */
export function paceElapsedPercent(resetsAt: string, durationMs: number) {
  const remainingMs = new Date(resetsAt).getTime() - Date.now();
  const elapsedMs = durationMs - remainingMs;
  return Math.max(0, Math.min(100, (elapsedMs / durationMs) * 100));
}

/** Marks how far through the window we'd be at a perfectly linear usage rate, so where the fill
 * ends relative to this line shows pace at a glance. It needs contrast against *both* the colored
 * fill (when ahead of pace, the marker sits on top of it) and the bare track (when behind pace,
 * the marker sits past the fill) — a canvas-colored halo keeps it visible on either, and it's
 * drawn taller than the bar so it reads as a tick mark rather than blending into the bar's edge. */
function PaceMarker({ pace, aheadOfPace }: Readonly<{ pace: number; aheadOfPace: boolean }>) {
  return (
    <div
      className="pointer-events-none absolute -top-[3px] h-[calc(100%+6px)] w-[3px] -translate-x-1/2 rounded-full"
      title={aheadOfPace ? 'Ahead of pace for this window' : 'On track for this window'}
      style={{
        left: `${pace}%`,
        backgroundColor: aheadOfPace ? '#f59e0b' : 'var(--color-ink)',
        opacity: aheadOfPace ? 1 : 0.85,
        boxShadow: '0 0 0 1.5px var(--color-canvas)',
      }}
    />
  );
}

/** Fill bar shared by the full meter and the overview lane. The pace marker is a sibling of the
 * clipped fill track (not inside it) so it can extend past the bar's height without being cut off
 * by the track's rounded-corner clipping. */
function UsageBar({
  percent,
  color,
  pace,
}: Readonly<{
  percent: number;
  color: string;
  pace?: number;
}>) {
  return (
    <div className="relative h-1.5">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          style={{ backgroundColor: color }}
        />
      </div>
      {pace !== undefined && <PaceMarker pace={pace} aheadOfPace={percent > pace} />}
    </div>
  );
}

export function UsageMeter({
  label,
  limit,
  color,
  windowMs,
  tokens,
}: Readonly<{
  label: string;
  limit: RateLimit;
  color: string;
  windowMs: number;
  tokens?: number;
}>) {
  const pace = paceElapsedPercent(limit.resetsAt, windowMs);

  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">
          <AnimatedNumber value={limit.usedPercent} suffix="%" />
        </span>
      </div>
      <UsageBar percent={limit.usedPercent} color={color} pace={pace} />
      <p className="mt-1 text-[11px] text-ink-faint">
        Resets {resetLabel(limit.resetsAt)}
        {tokens !== undefined && ` · ${formatCompactNumber(tokens)} tokens`}
      </p>
    </div>
  );
}

/** One overview-card row: a label/value line with that window's own bar directly beneath it.
 * `resetsAt`/`windowMs` are optional together — pass both to show a pace marker, omit both for a
 * plain fill (e.g. a lane with no rate-limit window to pace against). */
export function UsageLane({
  label,
  value,
  percent,
  color,
  resetsAt,
  windowMs,
}: Readonly<{
  label: string;
  value: string;
  percent?: number;
  color: string;
  resetsAt?: string;
  windowMs?: number;
}>) {
  const pace = resetsAt && windowMs ? paceElapsedPercent(resetsAt, windowMs) : undefined;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      {percent !== undefined && <UsageBar percent={percent} color={color} pace={pace} />}
    </div>
  );
}

/** Claude omits the 5-hour quota entirely when no session is active. Treat a confirmed zero
 * local total as an empty window, rather than making token count look like the quota state. */
export function ZeroUsageMeter({
  label,
  color,
}: Readonly<{
  label: string;
  color: string;
}>) {
  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">0%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: '0%' }} style={{ backgroundColor: color }} />
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">No active window</p>
    </div>
  );
}
