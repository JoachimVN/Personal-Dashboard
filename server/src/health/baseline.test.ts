import { describe, expect, it } from 'vitest';
import { computeHealthBaselines } from './baseline.js';

describe('computeHealthBaselines', () => {
  it('uses a personal trailing baseline and excludes the partial current day from its average', () => {
    const baseline = computeHealthBaselines([
      { date: '2026-07-01', restingHeartRate: 50 },
      { date: '2026-07-02', restingHeartRate: 52 },
      { date: '2026-07-03', restingHeartRate: 48 },
      { date: '2026-07-04', restingHeartRate: 50 },
    ], { date: '2026-07-05', restingHeartRate: 65, steps: 100 }, 7, 15);

    expect(baseline?.metrics.restingHeartRate).toMatchObject({
      average: 50,
      deviationPercent: 30,
      direction: 'above',
      anomalous: true,
    });
    expect(baseline?.metrics).not.toHaveProperty('steps');
  });

  it('requires at least three completed-day readings', () => {
    expect(computeHealthBaselines([
      { date: '2026-07-01', heartRate: 60 },
      { date: '2026-07-02', heartRate: 61 },
    ], { date: '2026-07-03', heartRate: 80 }, 7, 15)?.metrics.heartRate).toBeUndefined();
  });

  it('does not flag a partial day with low active energy as a baseline anomaly', () => {
    const baseline = computeHealthBaselines([
      { date: '2026-07-01', activeEnergyKcal: 420 },
      { date: '2026-07-02', activeEnergyKcal: 510 },
      { date: '2026-07-03', activeEnergyKcal: 470 },
    ], { date: '2026-07-04', activeEnergyKcal: 9 }, 7, 15);

    expect(baseline?.metrics.activeEnergyKcal).toMatchObject({
      direction: 'below',
      anomalous: false,
    });
  });
});
