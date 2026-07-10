import Parser from 'rss-parser';
import { newsSchema, type NewsData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const MAX_ITEMS = 12;

export interface NewsFeed {
  name: string;
  url: string;
}

export function createNewsProvider(feeds: NewsFeed[]): Provider<NewsData> {
  const parser = new Parser({ timeout: 10_000 });

  return {
    id: 'news',
    schema: newsSchema,
    refreshMs: 30 * 60_000,
    timeoutMs: 25_000,
    isConfigured: () => feeds.length > 0,
    async fetch() {
      const results = await Promise.allSettled(
        feeds.map(async (feed) => {
          const parsed = await parser.parseURL(feed.url);
          return (parsed.items ?? []).slice(0, MAX_ITEMS).map((item) => ({
            title: item.title ?? '(untitled)',
            source: feed.name,
            url: item.link ?? '',
            publishedAt: item.isoDate ?? new Date(0).toISOString(),
          }));
        }),
      );
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      if (fulfilled.length === 0) throw new Error('all feeds failed');
      return {
        items: fulfilled
          .flatMap((result) => result.value)
          .filter((item) => item.url)
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .slice(0, MAX_ITEMS),
      };
    },
  };
}
