import type { ReactNode } from 'react';
import type { WidgetEnvelope } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

interface WidgetCardProps<T> {
  readonly title: string;
  readonly envelope: WidgetEnvelope<T> | null;
  readonly offline: boolean;
  readonly children: (data: T) => ReactNode;
  readonly errorFallback?: (envelope: WidgetEnvelope<T>) => ReactNode | undefined;
}

export function WidgetCard<T>({ title, envelope, offline, children, errorFallback }: WidgetCardProps<T>) {
  return (
    <WidgetShell title={title} badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline} errorFallback={errorFallback}>
        {children}
      </WidgetBody>
    </WidgetShell>
  );
}

/** Amber "updated Xm ago" pill shown while a widget serves cached data after a failed refresh. */
export function StaleBadge({ envelope }: Readonly<{ envelope: WidgetEnvelope<unknown> | null }>) {
  if (envelope?.status !== 'stale' || !envelope.fetchedAt) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
      updated {relativeTime(envelope.fetchedAt)}
    </span>
  );
}

/** Card chrome (border/header) without the single-envelope status machine — for cards that combine multiple independently-polled sections. */
export function WidgetShell({
  title,
  badge,
  children,
}: Readonly<{
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="glass rounded-[1.5rem] p-5 transition-[border-color,box-shadow] duration-300 hover:border-white/15 sm:p-6">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {title}
        </h2>
        {badge}
      </header>
      {children}
    </section>
  );
}

/** The loading/disabled/error/ready state machine, reusable for a single section within a WidgetShell. */
export function WidgetBody<T>({
  envelope,
  offline,
  children,
  errorFallback,
}: Omit<WidgetCardProps<T>, 'title'>) {
  if (offline && !envelope) {
    return <p className="text-sm text-rose-500">Can’t reach the dashboard server.</p>;
  }
  if (!envelope || envelope.status === 'loading') {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-3/4 rounded bg-track" />
        <div className="h-4 w-1/2 rounded bg-track" />
      </div>
    );
  }
  if (envelope.status === 'disabled') {
    return (
      <p className="text-sm text-ink-faint">
        Not configured — see the README to set this widget up.
      </p>
    );
  }
  if (envelope.status === 'error' || envelope.data === undefined) {
    const fallback = errorFallback?.(envelope);
    if (fallback) return fallback;
    return <p className="text-sm text-rose-500">Couldn’t load ({envelope.error ?? 'unknown'}).</p>;
  }
  return <>{children(envelope.data)}</>;
}
