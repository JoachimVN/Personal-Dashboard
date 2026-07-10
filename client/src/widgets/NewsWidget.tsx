import type { NewsData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

export function NewsWidget() {
  const { envelope, offline } = useWidget<NewsData>('news');

  return (
    <WidgetCard title="News" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className="space-y-1.5 text-sm">
          {data.items.map((item) => (
            <li key={item.url} className="leading-tight">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink hover:underline"
              >
                {item.title}
              </a>
              <div className="text-xs text-ink-faint">
                {item.source} · {relativeTime(item.publishedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
