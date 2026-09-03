import { describe, expect, it, vi } from 'vitest';
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

describe('createAiNewsProvider resilience', () => {
  it('keeps the last known headlines for a group whose feeds all fail, instead of reporting no stories', async () => {
    const parseURL = vi.fn(async (url: string) => {
      if (url === 'https://anthropic.example/rss') {
        return {
          items: [
            { title: 'Claude update - Anthropic', link: 'https://anthropic.example/claude-update', isoDate: '2026-07-17T09:00:00.000Z' },
          ],
        };
      }
      if (url === 'https://openai.example/rss') {
        return { items: [{ title: 'GPT update', link: 'https://openai.example/gpt-update', isoDate: '2026-07-18T09:00:00.000Z' }] };
      }
      throw new Error('feed unreachable');
    });
    vi.doMock('rss-parser', () => ({ default: class { parseURL = parseURL; } }));
    vi.resetModules();
    const { createAiNewsProvider } = await import('./aiNews.js');

    const provider = createAiNewsProvider([
      { name: 'Anthropic', url: 'https://anthropic.example/rss', provider: 'anthropic' },
      { name: 'OpenAI', url: 'https://openai.example/rss', provider: 'openai' },
    ]);

    const first = await provider.fetch(new AbortController().signal, false);
    expect(first.items.map((item) => item.provider)).toContain('anthropic');

    // Anthropic's feed starts failing (e.g. Google News blocking this host) while OpenAI's is fine.
    parseURL.mockImplementation(async (url: string) => {
      if (url === 'https://anthropic.example/rss') throw new Error('blocked');
      return { items: [{ title: 'Newer GPT update', link: 'https://openai.example/newer', isoDate: '2026-07-19T09:00:00.000Z' }] };
    });

    const second = await provider.fetch(new AbortController().signal, false);
    expect(second.items.filter((item) => item.provider === 'anthropic')).toEqual(first.items.filter((item) => item.provider === 'anthropic'));
    expect(second.items.some((item) => item.provider === 'openai')).toBe(true);

    vi.doUnmock('rss-parser');
    vi.resetModules();
  });
});
