import { describe, expect, it } from 'vitest';
import { rankCandidates } from './rank.js';
import type { Candidate } from './types.js';

function candidate(id: string, source: string, score: number, shapes: Candidate['shapes']): Candidate {
  return { id, source, score, shapes, kind: 'calendar', kicker: id, title: id, detail: id, href: '#/', render: { type: 'text' } };
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
    expect([ranked.hero.source, ...ranked.secondary.map((slot) => slot.source), ...ranked.tiles.map((tile) => tile.source)])
      .toEqual(['calendar', 'github', 'gmail', 'health', 'ai']);
  });

  it('keeps the highest-ranked distinct secondary signals for the carousel', () => {
    const ranked = rankCandidates([
      candidate('calendar', 'calendar', 100, ['hero', 'secondary']),
      candidate('spotify', 'spotify', 90, ['secondary']),
      candidate('github', 'github', 80, ['secondary', 'tile']),
      candidate('weather', 'weather', 70, ['secondary', 'tile']),
      candidate('health', 'health', 60, ['secondary', 'tile']),
      candidate('gmail', 'gmail', 50, ['tile']),
      candidate('ai', 'ai', 40, ['tile']),
    ]);
    expect(ranked.secondary.map((slot) => slot.id)).toEqual(['spotify', 'github', 'weather']);
    expect(ranked.tiles.map((slot) => slot.source)).toEqual(['health', 'gmail', 'ai']);
  });

  it('does not reuse the hero candidate in a tile when another eligible candidate exists', () => {
    const ranked = rankCandidates([
      candidate('calendar-hero', 'calendar', 100, ['hero', 'secondary', 'tile']),
      candidate('spotify', 'spotify', 90, ['secondary']),
      candidate('github', 'github', 80, ['secondary']),
      candidate('weather', 'weather', 70, ['secondary']),
      candidate('calendar-tile', 'calendar', 60, ['tile']),
      candidate('gmail', 'gmail', 50, ['tile']),
      candidate('ai', 'ai', 40, ['tile']),
    ]);
    expect(ranked.tiles.map((slot) => slot.id)).toEqual(['gmail', 'ai']);
  });

  it('promotes the highest-ranked remaining tile when no secondary signal exists', () => {
    const ranked = rankCandidates([
      candidate('calendar', 'calendar', 100, ['hero']),
      candidate('health', 'health', 34, ['tile']),
      candidate('spotify', 'spotify', 30, ['tile']),
    ]);

    expect(ranked.secondary.map((slot) => slot.id)).toEqual(['health']);
    expect(ranked.tiles.map((slot) => slot.id)).toEqual(['spotify']);
  });
});
