import type { ReactNode } from 'react';
import type { WidgetEnvelope } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

interface WidgetCardProps<T> {
  title: string;
  envelope: WidgetEnvelope<T> | null;
  offline: boolean;
  children: (data: T) => ReactNode;
}

export function WidgetCard<T>({ title, envelope, offline, children }: WidgetCardProps<T>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h2>
        {envelope?.status === 'stale' && envelope.fetchedAt && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            updated {relativeTime(envelope.fetchedAt)}
          </span>
        )}
      </header>
      <Body envelope={envelope} offline={offline}>
        {children}
      </Body>
    </section>
  );
}

function Body<T>({
  envelope,
  offline,
  children,
}: Omit<WidgetCardProps<T>, 'title'>) {
  if (offline && !envelope) {
    return <p className="text-sm text-rose-500">Can’t reach the dashboard server.</p>;
  }
  if (!envelope || envelope.status === 'loading') {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }
  if (envelope.status === 'disabled') {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Not configured — see the README to set this widget up.
      </p>
    );
  }
  if (envelope.status === 'error' || envelope.data === undefined) {
    return <p className="text-sm text-rose-500">Couldn’t load ({envelope.error ?? 'unknown'}).</p>;
  }
  return <>{children(envelope.data)}</>;
}
