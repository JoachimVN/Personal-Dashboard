import type { HealthData, HealthDay } from '@personal-dashboard/shared';
import { computeDeviation, type Deviation } from '../deviation.js';

const baselineMetrics = [
  'heartRate',
  'restingHeartRate',
  'walkingHeartRate',
  'bloodOxygenPercent',
] as const;

/** Cumulative through the day — a partial morning total always reads "below average" against a
 * full-day baseline, so only an unusually HIGH reading counts as a real signal for these. */
const activityMetrics = [
  'steps',
  'exerciseMinutes',
  'standHours',
] as const;

type BaselineMetric = (typeof baselineMetrics)[number] | (typeof activityMetrics)[number];

export interface HealthBaseline {
  windowDays: number;
  minimumSamples: number;
  metrics: Partial<Record<BaselineMetric, Deviation>>;
}

export function computeHealthBaselines(
  history: HealthDay[],
  today: HealthDay | null,
  windowDays: number,
  deviationPercent: number,
): HealthBaseline | undefined {
  if (!today) return undefined;
  const priorDays = history
    .filter((day) => day.date !== today.date)
    .slice(-windowDays);
  const readingsFor = (metric: BaselineMetric) => priorDays
    .map((day) => day[metric])
    .filter((value): value is number => value !== undefined);
  const metrics: HealthBaseline['metrics'] = {};
  for (const metric of baselineMetrics) {
    const current = today[metric];
    if (current === undefined) continue;
    const deviation = computeDeviation(current, readingsFor(metric), deviationPercent);
    if (deviation) metrics[metric] = deviation;
  }
  for (const metric of activityMetrics) {
    const current = today[metric];
    if (current === undefined) continue;
    const deviation = computeDeviation(current, readingsFor(metric), deviationPercent);
    if (!deviation) continue;
    metrics[metric] = deviation.direction === 'above' ? deviation : { ...deviation, anomalous: false };
  }
  return { windowDays, minimumSamples: 3, metrics };
}

export function withHealthBaseline(
  snapshot: Pick<HealthData, 'today' | 'history'>,
  windowDays: number,
  deviationPercent: number,
): HealthBaseline | undefined {
  return computeHealthBaselines(snapshot.history, snapshot.today, windowDays, deviationPercent);
}
