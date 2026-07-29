import { describe, expect, it } from 'vitest';
import { isUsageReset } from './usageHistory.js';

describe('isUsageReset', () => {
  it.each([
    [47, 0],
    [12, 0],
    [100, 8],
  ])('recognizes %i%% to %i%% as a reset boundary', (previous, current) => {
    expect(isUsageReset(previous, current)).toBe(true);
  });

  it('keeps ordinary usage declines as normal chart segments', () => {
    expect(isUsageReset(47, 39)).toBe(false);
  });
});
