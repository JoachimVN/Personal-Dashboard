import type { HealthData, HealthDay } from '@personal-dashboard/shared';

const baselineMetrics = [
  'heartRate',
  'restingHeartRate',
  'walkingHeartRate',
  'bloodOxygenPercent',
] as const;

type BaselineMetric = (typeof baselineMetrics)[number];

export interface HealthBaseline {
  windowDays: number;
  minimumSamples: number;
  metrics: Partial<Record<BaselineMetric, {
    average: number;
    current: number;
    deviationPercent: number;
    samples: number;
    direction: 'above' | 'below';
    anomalous: boolean;
  }>>;
}

/**
 * Compares only same-day physiological readings to completed prior days. Cumulative activity
 * values intentionally stay out: a partial morning total is not a health anomaly.
 */
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
  const metrics: HealthBaseline['metrics'] = {};
  for (const metric of baselineMetrics) {
    const current = today[metric];
    const readings = priorDays
      .map((day) => day[metric])
      .filter((value): value is number => value !== undefined);
    if (current === undefined || readings.length < 3) continue;
    const average = readings.reduce((sum, value) => sum + value, 0) / readings.length;
    if (average === 0) continue;
    const deviation = ((current - average) / average) * 100;
    metrics[metric] = {
      average,
      current,
      deviationPercent: Math.abs(deviation),
      samples: readings.length,
      direction: deviation >= 0 ? 'above' : 'below',
      anomalous: Math.abs(deviation) >= deviationPercent,
    };
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
