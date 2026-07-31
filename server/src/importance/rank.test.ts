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

  it('does not promote routine Health when a real secondary signal exists', () => {
    const ranked = rankCandidates([
      candidate('calendar', 'calendar', 100, ['hero']),
      candidate('spotify', 'spotify', 60, ['secondary', 'tile']),
      candidate('health', 'health', 32, ['tile']),
    ]);

    expect(ranked.secondary.map((slot) => slot.id)).toEqual(['spotify']);
    expect(ranked.tiles.map((slot) => slot.id)).toEqual(['health']);
  });

  it('promotes the highest-ranked ordinary signal into hero when no hero moment exists', () => {
    const fallback: Candidate = {
      id: 'fallback:horizon', source: 'calendar', kind: 'fallback', score: 1, shapes: ['hero'],
      kicker: 'Open horizon', title: 'Nothing urgent right now', detail: 'detail', href: '#/', render: { type: 'text' },
    };
    const ranked = rankCandidates([
      fallback,
      candidate('spotify', 'spotify', 60, ['secondary', 'tile']),
      candidate('weather', 'weather', 40, ['tile']),
      candidate('health', 'health', 32, ['tile']),
    ]);

    expect(ranked.hero.id).toBe('spotify');
    // weather is tile-only, so with spotify promoted to hero (and no secondary-shaped
    // candidates left), it's promoted into the now-empty secondary slot instead of staying a tile.
    expect(ranked.secondary.map((slot) => slot.id)).toEqual(['weather']);
    expect(ranked.tiles.map((slot) => slot.id)).toEqual(['health']);
  });

  it('falls back to the horizon card when nothing else is eligible at all', () => {
    const fallback: Candidate = {
      id: 'fallback:horizon', source: 'calendar', kind: 'fallback', score: 1, shapes: ['hero'],
      kicker: 'Open horizon', title: 'Nothing urgent right now', detail: 'detail', href: '#/', render: { type: 'text' },
    };
    const ranked = rankCandidates([fallback]);

    expect(ranked.hero.id).toBe('fallback:horizon');
  });
});
