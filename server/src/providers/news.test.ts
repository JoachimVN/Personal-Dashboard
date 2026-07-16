import { describe, expect, it } from 'vitest';
import { selectNewsItems } from './news.js';

describe('selectNewsItems', () => {
  it('keeps a headline from every healthy feed when newer items fill the card', () => {
    const selected = selectNewsItems([
      [
        { title: 'NRK newest', source: 'NRK', url: 'https://nrk.example/newest', publishedAt: '2026-07-15T16:00:00.000Z' },
        ...Array.from({ length: 12 }, (_, index) => ({
          title: `NRK ${index}`,
          source: 'NRK',
          url: `https://nrk.example/${index}`,
          publishedAt: `2026-07-15T${String(15 - index).padStart(2, '0')}:00:00.000Z`,
        })),
      ],
      [
        { title: 'Tek newest', source: 'Tek.no', url: 'https://tek.example/newest', publishedAt: '2026-07-15T14:00:00.000Z' },
      ],
    ]);

    expect(selected).toHaveLength(12);
    expect(selected.map((item) => item.source)).toContain('Tek.no');
    expect(selected.map((item) => item.title).slice(0, 2)).toEqual(['NRK newest', 'Tek newest']);
  });

  it('uses all available slots from a single healthy feed', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      title: `Story ${index}`,
      source: 'Tek.no',
      url: `https://tek.example/${index}`,
      publishedAt: `2026-07-15T${String(12 - index).padStart(2, '0')}:00:00.000Z`,
    }));

    expect(selectNewsItems([items])).toHaveLength(12);
  });
});
