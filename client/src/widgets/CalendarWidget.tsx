import { useMemo, useState } from 'react';
import type { CalendarData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { mapsSearchHref } from '../lib/maps';

type CalendarEvent = CalendarData['events'][number];

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

function ChevronIcon({ direction }: Readonly<{ direction: 'left' | 'right' }>) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <path
        d={direction === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** How many months either side of the current one the server keeps cached. */
const MAX_MONTH_OFFSET = 12;

function monthReference(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function firstOfMonthKey(offset: number): string {
  return monthReference(offset).toLocaleDateString('en-CA');
}

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

function dayHeading(date: string): string {
  const todayStr = todayKey();
  const tomorrowStr = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  if (date === todayStr) return 'Today';
  if (date === tomorrowStr) return 'Tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface GridDay {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/** Monday-start weeks covering the whole month, padded with the edge days of neighboring months
 *  so every row is a full week. */
function buildMonthGrid(reference: Date): GridDay[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const trailingDays = 6 - ((monthEnd.getDay() + 6) % 7);

  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - leadingDays);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + trailingDays);

  const today = todayKey();
  const days: GridDay[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    const key = cursor.toLocaleDateString('en-CA');
    days.push({ key, day: cursor.getDate(), inMonth: cursor.getMonth() === month, isToday: key === today });
  }
  return days;
}

/** All date-grid buckets an event should appear under — every day it spans for multi-day all-day
 *  events (DTEND is exclusive per iCal convention), just its start day otherwise. Reads dates back
 *  through the local calendar (like `event.date` already does), not raw UTC — an all-day event's
 *  instant isn't necessarily UTC midnight, so slicing the ISO string can land on the wrong day. */
function datesForEvent(event: CalendarEvent): string[] {
  if (!event.allDay) return [event.date];
  const endDay = new Date(event.end).toLocaleDateString('en-CA');
  const dates: string[] = [];
  for (
    const cursor = new Date(`${event.date}T12:00:00`);
    cursor.toLocaleDateString('en-CA') < endDay;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    dates.push(cursor.toLocaleDateString('en-CA'));
  }
  return dates.length > 0 ? dates : [event.date];
}

/** One dot per distinct calendar represented that day, not one per event. */
function dotsForDay(events: CalendarEvent[]): string[] {
  const colors = new Map<string, string>();
  for (const event of events) {
    if (!colors.has(event.calendar)) colors.set(event.calendar, calendarColor(event.calendar));
  }
  return [...colors.values()];
}

function EventList({ events }: Readonly<{ events: CalendarEvent[] }>) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing scheduled.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {events.map((event) => (
        <li key={event.id} className="flex items-baseline gap-2">
          <span className="w-20 shrink-0 tabular-nums text-ink-muted">
            {event.allDay ? 'all day' : `${event.startLabel}–${event.endLabel}`}
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
  );
}

/** The very next event, wherever it falls — including past the visible grid (e.g. early next
 *  month) — so it's never hidden just because the calendar hasn't turned the page yet. */
function UpNext({ events }: Readonly<{ events: CalendarEvent[] }>) {
  const next = events.find((event) => new Date(event.end).getTime() >= Date.now());
  if (!next) return null;
  const when = next.allDay ? dayHeading(next.date) : `${dayHeading(next.date)} · ${next.startLabel}`;
  return (
    <p className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-muted">
      <span className="shrink-0 font-semibold uppercase tracking-wide text-ink-faint">Next</span>
      <span className="truncate">
        <span className="font-medium text-ink">{next.title}</span> · {when}
      </span>
    </p>
  );
}

export function CalendarWidget() {
  const { envelope, offline } = useWidget<CalendarData>('calendar');
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [monthOffset, setMonthOffset] = useState(0);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of envelope?.data?.events ?? []) {
      for (const dateKey of datesForEvent(event)) {
        const bucket = map.get(dateKey);
        if (bucket) bucket.push(event);
        else map.set(dateKey, [event]);
      }
    }
    return map;
  }, [envelope?.data]);

  function goToMonth(offset: number) {
    const clamped = Math.max(-MAX_MONTH_OFFSET, Math.min(MAX_MONTH_OFFSET, offset));
    setMonthOffset(clamped);
    setSelectedDate(clamped === 0 ? todayKey() : firstOfMonthKey(clamped));
  }

  return (
    <WidgetCard title="Calendar" envelope={envelope} offline={offline}>
      {(data) => {
        const grid = buildMonthGrid(monthReference(monthOffset));
        const monthLabel = monthReference(monthOffset).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        const selectedEvents = eventsByDate.get(selectedDate) ?? [];

        return (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToMonth(monthOffset - 1)}
                  disabled={monthOffset <= -MAX_MONTH_OFFSET}
                  aria-label="Previous month"
                  className="rounded p-0.5 text-ink-faint transition hover:bg-track hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                >
                  <ChevronIcon direction="left" />
                </button>
                <p className="w-32 shrink-0 whitespace-nowrap text-center text-sm font-semibold text-ink">{monthLabel}</p>
                <button
                  type="button"
                  onClick={() => goToMonth(monthOffset + 1)}
                  disabled={monthOffset >= MAX_MONTH_OFFSET}
                  aria-label="Next month"
                  className="rounded p-0.5 text-ink-faint transition hover:bg-track hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                >
                  <ChevronIcon direction="right" />
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(0)}
                  className={`ml-1 whitespace-nowrap rounded-full border border-card-border px-2 py-0.5 text-[10px] font-medium text-ink-faint transition hover:border-ink-faint hover:text-ink ${monthOffset === 0 ? 'invisible' : ''}`}
                >
                  Today
                </button>
              </div>
              <UpNext events={data.events} />
            </div>

            <div>
              <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="py-1">{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((cell) => {
                  const dots = dotsForDay(eventsByDate.get(cell.key) ?? []);
                  const isSelected = cell.key === selectedDate;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.key)}
                      className={[
                        'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition',
                        cell.inMonth ? 'text-ink' : 'text-ink-faint/60',
                        isSelected
                          ? 'bg-(--color-accent-personal)/15 ring-1 ring-(--color-accent-personal)'
                          : 'hover:bg-track',
                      ].join(' ')}
                    >
                      <span className={cell.isToday && !isSelected ? 'font-semibold text-(--color-accent-personal)' : undefined}>
                        {cell.day}
                      </span>
                      <span className="flex h-1 gap-0.5">
                        {dots.slice(0, 4).map((color) => (
                          <span key={color} aria-hidden className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-card-border pt-3">
              <h3 className="mb-1 text-xs font-medium text-ink-faint">{dayHeading(selectedDate)}</h3>
              <EventList events={selectedEvents} />
            </div>
          </div>
        );
      }}
    </WidgetCard>
  );
}
