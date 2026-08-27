import { describe, expect, it } from 'vitest';
import { compareCalendarEvents, parseVCardBirthday } from './calendar.js';
import { batabiboingCalendarFeed, parseCalendarIcsFeeds } from '../env.js';

describe('parseVCardBirthday', () => {
  it('parses a dashed BDAY with a known year', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Thomas Bekkevold Nilsen\nBDAY;value=date:1971-01-22\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Thomas Bekkevold Nilsen', month: 1, day: 22, year: 1971 });
  });

  it('parses an undashed BDAY', () => {
    const vcard = 'BEGIN:VCARD\nFN:Brooklyn\nBDAY;value=date:20060831\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Brooklyn', month: 8, day: 31, year: 2006 });
  });

  it('parses a year-less BDAY (RFC 6350 "--MM-DD")', () => {
    const vcard = 'BEGIN:VCARD\nFN:Anon\nBDAY;value=date:--03-15\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Anon', month: 3, day: 15, year: undefined });
  });

  it('returns undefined when there is no BDAY field', () => {
    const vcard = 'BEGIN:VCARD\nFN:No Birthday\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toBeUndefined();
  });

  it('returns undefined when there is no FN field', () => {
    const vcard = 'BEGIN:VCARD\nBDAY;value=date:1990-05-01\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toBeUndefined();
  });

  it('returns undefined for missing data', () => {
    expect(parseVCardBirthday(undefined)).toBeUndefined();
  });
});

describe('parseCalendarIcsFeeds', () => {
  it('keeps named HTTPS subscriptions and skips invalid entries', () => {
    expect(parseCalendarIcsFeeds(JSON.stringify([
      { name: 'Batabiboing', url: 'https://batabiboing.vercel.app/api/calendar/example' },
      { name: '', url: 'https://example.com/empty-name.ics' },
      { name: 'Insecure', url: 'http://example.com/feed.ics' },
    ]))).toEqual([
      { name: 'Batabiboing', url: 'https://batabiboing.vercel.app/api/calendar/example' },
    ]);
  });

  it('returns no subscriptions for malformed configuration', () => {
    expect(parseCalendarIcsFeeds('{')).toEqual([]);
  });
});

describe('batabiboingCalendarFeed', () => {
  it('derives a scoped feed URL from the existing dashboard push configuration', () => {
    const feed = batabiboingCalendarFeed('https://batabiboing.vercel.app/api/push', 'push-secret');
    expect(feed?.name).toBe('Batabiboing');
    expect(feed?.url).toMatch(/^https:\/\/batabiboing\.vercel\.app\/api\/calendar\?token=/);
    expect(feed?.url).not.toContain('push-secret');
  });

  it('does not derive a feed from a non-push route', () => {
    expect(batabiboingCalendarFeed('https://batabiboing.vercel.app/api/other', 'push-secret')).toBeUndefined();
  });
});

describe('compareCalendarEvents', () => {
  const event = (id: string, start: string) => ({
    id, start, title: id, date: start.slice(0, 10), end: start, allDay: false,
    calendar: 'Calendar', startLabel: '08:15', endLabel: '12:15',
  } as Parameters<typeof compareCalendarEvents>[0]);

  it('orders by start time first', () => {
    const events = [event('b', '2026-09-03T10:00:00.000Z'), event('a', '2026-09-03T06:15:00.000Z')];
    expect([...events].sort(compareCalendarEvents).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('produces one ordering for events sharing a start, whatever order the fetches resolved in', () => {
    // The real regression: two events at the same start time, arriving from concurrent per-calendar
    // fetches that resolve in a different order each poll. Sorting on `start` alone left the array
    // in whatever order it arrived, so an unchanged calendar re-serialized to different bytes and
    // got archived every five minutes.
    const start = '2026-09-03T06:15:00.000Z';
    const lecture = event('3568ababcfc9c6e-' + start, start);
    const lab = event('4468ababcfc9d09-' + start, start);

    const oneWay = [lecture, lab].sort(compareCalendarEvents).map((e) => e.id);
    const theOther = [lab, lecture].sort(compareCalendarEvents).map((e) => e.id);

    expect(oneWay).toEqual(theOther);
  });

  it('is a total order, so shuffling the input never changes the output', () => {
    const starts = ['2026-09-03T06:15:00.000Z', '2026-09-03T06:15:00.000Z', '2026-09-03T08:00:00.000Z'];
    const events = starts.map((s, i) => event(`uid${i}-${s}`, s));
    const expected = [...events].sort(compareCalendarEvents).map((e) => e.id);
    for (const permutation of [[2, 0, 1], [1, 2, 0], [2, 1, 0], [0, 2, 1]]) {
      const shuffled = permutation.map((i) => events[i]);
      expect(shuffled.sort(compareCalendarEvents).map((e) => e.id)).toEqual(expected);
    }
  });
});
