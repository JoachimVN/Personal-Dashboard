import { describe, expect, it } from 'vitest';
import { rankCandidates } from './rank.js';
import type { Candidate } from './types.js';

function candidate(id: string, source: string, score: number, shapes: Candidate['shapes']): Candidate {
  return { id, source, score, shapes, kind: 'fallback', kicker: id, title: id, detail: id, href: '#/', render: { type: 'text' } };
}

describe('rankCandidates', () => {
  it('prefers a different source for each slot when an eligible one exists', () => {
    const ranked = rankCandidates([
      candidate('calendar', 'calendar', 100, ['hero', 'secondary']),
      candidate('gmail', 'gmail', 80, ['hero', 'tile']),
      candidate('github', 'github', 70, ['secondary', 'tile']),
      candidate('health', 'health', 60, ['tile']),
      candidate('ai', 'ai', 50, ['tile']),
    ]);
    expect([ranked.hero.source, ranked.secondary.source, ...ranked.tiles.map((tile) => tile.source)])
      .toEqual(['calendar', 'github', 'gmail', 'health', 'ai']);
  });
});
