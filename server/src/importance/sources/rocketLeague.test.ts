import { describe, expect, it } from 'vitest';
import { rocketLeagueCandidates } from './rocketLeague.js';

const NOW = Date.parse('2026-08-21T22:00:00.000Z');

describe('rocketLeagueCandidates', () => {
  it('keeps the menu state and session duration on separate card lines', () => {
    const [candidate] = rocketLeagueCandidates({
      state: 'menus',
      startedAt: new Date(NOW - 45 * 60_000).toISOString(),
      observedAt: new Date(NOW - 20_000).toISOString(),
    }, NOW);

    expect(candidate).toMatchObject({
      kicker: 'Playing now',
      title: 'Rocket League',
      detail: 'for 45m',
      render: { type: 'rocket-league-slot', activity: 'In the menus' },
    });
  });

  it('formats longer sessions like Minecraft', () => {
    expect(rocketLeagueCandidates({
      state: 'menus',
      startedAt: new Date(NOW - 154 * 60_000).toISOString(),
      observedAt: new Date(NOW - 20_000).toISOString(),
    }, NOW)[0]?.detail).toBe('for 2h 34m');
  });
});
