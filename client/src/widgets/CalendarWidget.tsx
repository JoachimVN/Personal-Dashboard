import { useMemo } from 'react';
import type { CalendarData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

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
                        <span className="block truncate font-medium">{event.title}</span>
                        {event.location && (
                          <span className="block truncate text-xs text-ink-faint">
                            {event.location}
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
