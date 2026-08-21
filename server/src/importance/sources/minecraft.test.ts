import { describe, expect, it } from 'vitest';
import { minecraftCandidates } from './minecraft.js';

const NOW = Date.parse('2026-08-21T22:00:00.000Z');

describe('minecraftCandidates', () => {
  it('reports the session with how long it has been running', () => {
    const [candidate] = minecraftCandidates({
      startedAt: new Date(NOW - 45 * 60_000).toISOString(),
      observedAt: new Date(NOW - 20_000).toISOString(),
    }, NOW);
    expect(candidate).toMatchObject({ kicker: 'Playing now', title: 'Minecraft', detail: '45m in' });
  });

  it('spells longer sessions out in hours', () => {
    expect(minecraftCandidates({
      startedAt: new Date(NOW - 154 * 60_000).toISOString(),
      observedAt: new Date(NOW).toISOString(),
    }, NOW)[0]?.detail).toBe('2h 34m in');

    expect(minecraftCandidates({
      startedAt: new Date(NOW - 120 * 60_000).toISOString(),
      observedAt: new Date(NOW).toISOString(),
    }, NOW)[0]?.detail).toBe('2h in');
  });

  it('drops a stale reading rather than claiming a session that may be over', () => {
    expect(minecraftCandidates({
      startedAt: new Date(NOW - 60 * 60_000).toISOString(),
      observedAt: new Date(NOW - 10 * 60_000).toISOString(),
    }, NOW)).toEqual([]);
  });

  it('offers nothing when nothing is being played', () => {
    expect(minecraftCandidates(null, NOW)).toEqual([]);
    expect(minecraftCandidates(undefined, NOW)).toEqual([]);
  });
});
