export interface Deviation {
  average: number;
  current: number;
  deviationPercent: number;
  samples: number;
  direction: 'above' | 'below';
  anomalous: boolean;
}

/**
 * Compares a current value to the average of prior samples. Used wherever "is this unusual for
 * me" needs to be answered the same way regardless of domain (health vitals, GitHub contributions,
 * AI usage) — see server/src/health/baseline.ts for the original single-purpose version this
 * generalizes.
 */
export function computeDeviation(
  current: number,
  priorValues: number[],
  deviationPercent: number,
  minimumSamples = 3,
): Deviation | undefined {
  if (priorValues.length < minimumSamples) return undefined;
  const average = priorValues.reduce((sum, value) => sum + value, 0) / priorValues.length;
  if (average === 0) return undefined;
  const deviation = ((current - average) / average) * 100;
  return {
    average,
    current,
    deviationPercent: Math.abs(deviation),
    samples: priorValues.length,
    direction: deviation >= 0 ? 'above' : 'below',
    anomalous: Math.abs(deviation) >= deviationPercent,
  };
}
