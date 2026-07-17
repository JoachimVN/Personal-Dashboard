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
  const aheadOfPace = limit.usedPercent > pace;

  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">
          <AnimatedNumber value={limit.usedPercent} suffix="%" />
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${limit.usedPercent}%` }}
          style={{ backgroundColor: color }}
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
      <p className="mt-1 text-[11px] text-ink-faint">
        Resets {resetLabel(limit.resetsAt)}
        {tokens !== undefined && ` · ${formatCompactNumber(tokens)} tokens`}
      </p>
    </div>
  );
}

/** One overview-card row: a label/value line with that window's own bar directly beneath it. */
export function UsageLane({
  label,
  value,
  percent,
  color,
}: Readonly<{
  label: string;
  value: string;
  percent?: number;
  color: string;
}>) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      {percent !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-track">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            style={{ backgroundColor: color }}
          />
        </div>
      )}
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
