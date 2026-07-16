import { useMemo } from 'react';
import type { CalendarData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { mapsSearchHref } from '../lib/maps';

/** Stable per-calendar dot color derived from the calendar's name; readable in both modes. */
function calendarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = Math.trunc(hash * 31 + (char.codePointAt(0) ?? 0));
  const hue = Math.abs(hash) % 360;
  return `light-dark(hsl(${hue} 55% 42%), hsl(${hue} 55% 65%))`;
}

function NoteIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 h-3.5 w-3.5 shrink-0">
      <path d="M3.5 2.75h9v10.5h-9zM5.5 6h5M5.5 8.5h5" />
    </svg>
  );
}

function dayHeading(date: string): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  const tomorrowStr = new Date(today.getTime() + 86_400_000).toLocaleDateString('en-CA');
  if (date === todayStr) return 'Today';
  if (date === tomorrowStr) return 'Tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export function CalendarWidget() {
  const { envelope, offline } = useWidget<CalendarData>('calendar');

  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarData['events']>();
    for (const event of envelope?.data?.events ?? []) {
      const bucket = groups.get(event.date);
      if (bucket) bucket.push(event);
      else groups.set(event.date, [event]);
    }
    return [...groups.entries()];
  }, [envelope?.data]);

  return (
    <WidgetCard title="Calendar" envelope={envelope} offline={offline}>
      {(data) =>
        data.events.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Nothing scheduled in the next 7 days.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, events]) => (
              <div key={date}>
                <h3 className="mb-1 text-xs font-medium text-ink-faint">
                  {dayHeading(date)}
                </h3>
                <ul className="space-y-1 text-sm">
                  {events.map((event) => (
                    <li key={event.id} className="flex items-baseline gap-2">
                      <span className="w-20 shrink-0 tabular-nums text-ink-muted">
                        {event.allDay
                          ? 'all day'
                          : `${event.startLabel}–${event.endLabel}`}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            title={event.calendar}
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: calendarColor(event.calendar) }}
                          />
                          <span className="truncate font-medium">{event.title}</span>
                        </span>
                        {event.location && (
                          <a
                            href={mapsSearchHref(event.location)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-faint transition hover:text-ink"
                          >
                            <span aria-hidden className="shrink-0">📍</span>
                            <span className="truncate">{event.location}</span>
                          </a>
                        )}
                        {event.description && (
                          <span className="mt-1.5 flex gap-1.5 border-l border-card-border pl-2 text-xs text-ink-muted">
                            <NoteIcon />
                            <span className="line-clamp-2 whitespace-pre-line">{event.description}</span>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    </WidgetCard>
  );
}
