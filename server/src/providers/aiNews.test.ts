import { describe, expect, it } from 'vitest';
import { selectNewsItems } from './news.js';

describe('selectNewsItems (ai news)', () => {
  it('keeps a headline from both OpenAI and Anthropic feeds', () => {
    const selected = selectNewsItems([
      [
        { title: 'GPT update', source: 'OpenAI', url: 'https://openai.example/gpt-update', publishedAt: '2026-07-18T09:00:00.000Z', provider: 'openai' as const },
        { title: 'Older OpenAI post', source: 'OpenAI', url: 'https://openai.example/older', publishedAt: '2026-07-16T09:00:00.000Z', provider: 'openai' as const },
      ],
      [
        { title: 'Claude update', source: 'Anthropic', url: 'https://anthropic.example/claude-update', publishedAt: '2026-07-17T09:00:00.000Z', provider: 'anthropic' as const },
      ],
    ]);

    expect(selected.map((item) => item.provider)).toContain('openai');
    expect(selected.map((item) => item.provider)).toContain('anthropic');
    expect(selected.map((item) => item.title).slice(0, 2)).toEqual(['GPT update', 'Claude update']);
  });
});
