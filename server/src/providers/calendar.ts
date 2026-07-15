import { createDAVClient } from 'tsdav';
import ical from 'node-ical';
import { calendarSchema, type CalendarData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const RANGE_DAYS = 7;

type CalendarEvent = CalendarData['events'][number];
type ExpandedEvent = { event: VEvent; start: Date; end: Date };
type DateFormatter = Intl.DateTimeFormat;

/** Minutes-offset of a timezone at a given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/** A Date whose UTC fields hold wall-clock time in `timeZone` → real instant. */
function wallTimeToInstant(wall: Date, timeZone: string): Date {
  const guess = new Date(wall.getTime() - tzOffsetMs(wall, timeZone));
  const corrected = new Date(wall.getTime() - tzOffsetMs(guess, timeZone));
  return corrected;
}

interface VEvent {
  type: 'VEVENT';
  uid: string;
  summary?: string | { val: string };
  location?: string;
  description?: string | { val: string };
  status?: string;
  datetype?: string;
  start: Date & { tz?: string };
  end?: Date;
  rrule?: {
    between(after: Date, before: Date, inc?: boolean): Date[];
    origOptions: { tzid?: string };
  };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, VEvent>;
}

const text = (value: string | { val: string } | undefined): string =>
  typeof value === 'object' ? value.val : (value ?? '');

/**
 * rrule occurrences come back with the wall-clock of the event start encoded in
 * UTC fields (tz-aware rules) or drifting with the server's DST (floating
 * rules) — both need correcting to real instants.
 */
function fixOccurrence(occ: Date, event: VEvent): Date {
  const tzid = event.rrule?.origOptions.tzid;
  if (tzid) return wallTimeToInstant(occ, tzid);
  const driftMin = occ.getTimezoneOffset() - event.start.getTimezoneOffset();
  return new Date(occ.getTime() - driftMin * 60_000);
}

function expandEvent(
  event: VEvent,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const durationMs = (event.end?.getTime() ?? event.start.getTime()) - event.start.getTime();

  if (!event.rrule) {
    const end = new Date(event.start.getTime() + durationMs);
    return end > rangeStart && event.start < rangeEnd
      ? [{ event, start: event.start, end }]
      : [];
  }

  // Widen the query so occurrences straddling the range edges survive fixup.
  const occurrences = event.rrule.between(
    new Date(rangeStart.getTime() - 86_400_000),
    new Date(rangeEnd.getTime() + 86_400_000),
    true,
  );
  const results: ExpandedEvent[] = [];
  for (const raw of occurrences) {
    const dateKey = raw.toISOString().slice(0, 10);
    if (event.exdate?.[dateKey]) continue;

    const override = event.recurrences?.[dateKey];
    const start = override ? override.start : fixOccurrence(raw, event);
    const overrideDuration = override
      ? (override.end?.getTime() ?? start.getTime()) - override.start.getTime()
      : durationMs;
    const end = override?.end ?? new Date(start.getTime() + overrideDuration);
    if (end > rangeStart && start < rangeEnd) {
      results.push({ event: override ?? event, start, end });
    }
  }
  return results;
}

function eventFromOccurrence(
  occurrence: ExpandedEvent,
  calendarName: string,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent {
  const { event, start, end } = occurrence;
  const allDay = event.datetype === 'date';
  return {
    id: `${event.uid}-${start.toISOString()}`,
    title: text(event.summary) || '(untitled)',
    calendar: calendarName,
    allDay,
    location: text(event.location).trim() || undefined,
    description: text(event.description).trim() || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    // All-day DTSTARTs are date-only (midnight UTC) — read the date
    // straight off them instead of shifting through the timezone.
    date: allDay ? start.toISOString().slice(0, 10) : dateFmt.format(start),
    startLabel: allDay ? 'all day' : timeFmt.format(start),
    endLabel: allDay ? '' : timeFmt.format(end),
  };
}

function eventsForComponent(
  component: VEvent,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent[] {
  if (component.type !== 'VEVENT' || component.status === 'CANCELLED') return [];
  return expandEvent(component, calendarName, rangeStart, rangeEnd)
    .map((occurrence) => eventFromOccurrence(occurrence, calendarName, dateFmt, timeFmt));
}

function eventsForCalendarObject(
  data: string | undefined,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent[] {
  if (!data) return [];
  const parsed = ical.sync.parseICS(data) as Record<string, VEvent>;
  return Object.values(parsed).flatMap((component) =>
    eventsForComponent(component, calendarName, rangeStart, rangeEnd, dateFmt, timeFmt));
}

export function createCalendarProvider(
  auth: { username: string; password: string } | undefined,
  allowlist: string[],
  timezone: string,
): Provider<CalendarData> {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    id: 'calendar',
    schema: calendarSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 30_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('calendar is not configured');

      // tsdav can't take an AbortSignal; reject on abort so the scheduler's
      // timeout still lands (the underlying request is simply left behind).
      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
      const race = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);

      const client = await race(
        createDAVClient({
          serverUrl: 'https://caldav.icloud.com',
          credentials: { username: auth.username, password: auth.password },
          authMethod: 'Basic',
          defaultAccountType: 'caldav',
        }),
      );

      const rangeStart = new Date();
      const rangeEnd = new Date(rangeStart.getTime() + RANGE_DAYS * 86_400_000);

      const calendars = (await race(client.fetchCalendars())).filter((calendar) => {
        const name = text(calendar.displayName as string | undefined);
        const holdsEvents =
          !calendar.components || calendar.components.includes('VEVENT');
        return holdsEvents && (allowlist.length === 0 || allowlist.includes(name));
      });

      const eventGroups = await Promise.all(calendars.map(async (calendar) => {
        const calendarName = text(calendar.displayName as string | undefined) || 'Calendar';
        const objects = await race(client.fetchCalendarObjects({
          calendar,
          timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
        }));
        return objects.flatMap((object) =>
          eventsForCalendarObject(object.data, calendarName, rangeStart, rangeEnd, dateFmt, timeFmt));
      }));
      const events = eventGroups.flat();

      events.sort((a, b) => a.start.localeCompare(b.start));
      return { events: events.slice(0, 50) };
    },
  };
}
