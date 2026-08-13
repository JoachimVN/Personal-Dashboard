import { describe, expect, it } from 'vitest';
import { stratifiedSamples } from './enrichValorantHistory.js';

describe('Valorant match enrichment', () => {
  it('samples the full span of each year instead of clustering at one end', () => {
    const matches = [
      '2026-12-01T00:00:00Z',
      '2026-09-01T00:00:00Z',
      '2026-06-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
      '2025-12-01T00:00:00Z',
      '2025-01-01T00:00:00Z',
    ].map((startedAt) => ({ startedAt }));

    expect(stratifiedSamples(matches, 3).map((match) => match.startedAt)).toEqual([
      '2026-12-01T00:00:00Z',
      '2026-06-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
      '2025-12-01T00:00:00Z',
      '2025-01-01T00:00:00Z',
    ]);
  });
});
