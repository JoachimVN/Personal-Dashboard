import { useEffect, useMemo, useState } from 'react';
import type { CalendarData, GitHubData, GmailData, WeatherData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { deg, glyph } from '../../lib/weather';

const SNAPSHOT_KEY = 'personal-dashboard:today-brief';

interface BriefSnapshot {
  capturedAt: string;
  unreadThreads?: number;
  calendarIds: string[];
  activityIds: string[];
}

function readSnapshot(): BriefSnapshot | null {
  try {
    const saved = localStorage.getItem(SNAPSHOT_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as BriefSnapshot;
    return Array.isArray(parsed.calendarIds) && Array.isArray(parsed.activityIds) ? parsed : null;
  } catch {
    return null;
  }
}

/** A local, deterministic briefing — no model calls or server-side history required. */
export function TodayBrief() {
  const weather = useWidget<WeatherData>('weather');
  const calendar = useWidget<CalendarData>('calendar');
  const gmail = useWidget<GmailData>('gmail');
  const github = useWidget<GitHubData>('github');
  const [previous] = useState(readSnapshot);

  const snapshot = useMemo<BriefSnapshot>(() => ({
    capturedAt: new Date().toISOString(),
    unreadThreads: gmail.envelope?.data?.unreadThreads,
    calendarIds: calendar.envelope?.data?.events.map((event) => event.id) ?? [],
    activityIds: github.envelope?.data?.activity.map((item) => item.id) ?? [],
  }), [calendar.envelope?.data?.events, github.envelope?.data?.activity, gmail.envelope?.data?.unreadThreads]);

  useEffect(() => {
    if (!snapshot.calendarIds.length && snapshot.unreadThreads === undefined && !snapshot.activityIds.length) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [snapshot]);

  const lines = useMemo(() => {
    const result: { text: string; tone: 'normal' | 'attention' | 'positive' }[] = [];
    const next = calendar.envelope?.data?.events.find((event) => new Date(event.end) >= new Date());
    if (next) result.push({ text: `${next.allDay ? 'Today' : next.startLabel} · ${next.title}`, tone: 'normal' });
    const current = weather.envelope?.data?.current;
    if (current) result.push({ text: `${glyph(current.symbol)} ${deg(current.temperature)} · ${Math.round(current.windSpeed)} m/s wind`, tone: 'normal' });
    const unread = gmail.envelope?.data?.unreadThreads;
    if (unread !== undefined) {
      const delta = previous?.unreadThreads === undefined ? 0 : unread - previous.unreadThreads;
      result.push({
        text: delta > 0 ? `${delta} new unread email${delta === 1 ? '' : 's'}` : `${unread} unread email${unread === 1 ? '' : 's'}`,
        tone: delta > 0 || unread > 6 ? 'attention' : 'normal',
      });
    }
    const newActivity = github.envelope?.data?.activity.filter((item) => !previous?.activityIds.includes(item.id)) ?? [];
    if (previous && newActivity.length) result.push({ text: `${newActivity.length} new GitHub update${newActivity.length === 1 ? '' : 's'}`, tone: 'positive' });
    return result.slice(0, 4);
  }, [calendar.envelope?.data?.events, github.envelope?.data?.activity, gmail.envelope?.data?.unreadThreads, previous, weather.envelope?.data?.current]);

  return (
    <div className="col-span-2 rounded-2xl border border-card-border bg-track/40 px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Today brief</span>
        {previous && <span className="text-[10px] text-ink-faint">since last visit</span>}
      </div>
      <ul className="space-y-1">
        {lines.length ? lines.map((line) => (
          <li key={line.text} className="flex items-baseline gap-2 text-sm">
            <span className={line.tone === 'attention' ? 'text-amber-500' : line.tone === 'positive' ? 'text-emerald-500' : 'text-ink-faint'} aria-hidden>•</span>
            <span className="truncate">{line.text}</span>
          </li>
        )) : <li className="text-sm text-ink-faint">Your sources are loading.</li>}
      </ul>
    </div>
  );
}
