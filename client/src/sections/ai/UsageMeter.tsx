import { motion } from 'motion/react';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { AnimatedNumber } from '../../components/AnimatedNumber';

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
}: Readonly<{
  label: string;
  limit: RateLimit;
  color: string;
  windowMs: number;
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
      <p className="mt-1 text-[11px] text-ink-faint">Resets {resetLabel(limit.resetsAt)}</p>
    </div>
  );
}
