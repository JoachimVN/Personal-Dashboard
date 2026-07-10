import type { GmailData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

export function GmailWidget() {
  const { envelope, offline } = useWidget<GmailData>('gmail');

  return (
    <WidgetCard title="Mail" envelope={envelope} offline={offline}>
      {(data) => (
        <div>
          <p className="mb-2 text-sm">
            <span className="text-2xl font-bold tabular-nums">{data.unreadThreads}</span>{' '}
            <span className="text-slate-500 dark:text-slate-400">unread</span>
          </p>
          <ul className="space-y-1.5 text-sm">
            {data.threads.map((thread) => (
              <li key={thread.id}>
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block min-w-0"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`truncate ${
                        thread.unread
                          ? 'font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {thread.from}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {relativeTime(thread.date)}
                    </span>
                  </span>
                  <span
                    className={`block truncate text-xs group-hover:underline ${
                      thread.unread
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {thread.subject}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
