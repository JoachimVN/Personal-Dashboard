import type {
  CalendarData,
  GmailData,
  HueData,
  IMessageData,
  NewsData,
  WeatherData,
} from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { deg, glyph, weatherLocation } from '../../lib/weather';
import { relativeTime } from '../../lib/time';
import { TodayBrief } from './TodayBrief';

function Mini({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <div className="mb-0.5 text-[11px] text-ink-faint">{label}</div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function eventLabel(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  const day =
    event.date === today
      ? ''
      : `${new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })} `;
  return `${day}${event.allDay ? 'all day' : event.startLabel}`;
}

export function PersonalOverview() {
  const weather = useWidget<WeatherData>('weather');
  const calendar = useWidget<CalendarData>('calendar');
  const gmail = useWidget<GmailData>('gmail');
  const news = useWidget<NewsData>('news');
  const hue = useWidget<HueData>('hue');
  const imessage = useWidget<IMessageData>('imessage');

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      <TodayBrief />
      <Mini label="Weather">
        <WidgetBody envelope={weather.envelope} offline={weather.offline}>
          {(data) => (
            <span className="flex flex-col">
              <span className="font-semibold">{glyph(data.current.symbol)} {deg(data.current.temperature)}</span>
              <span className="text-[10px] text-ink-faint">{weatherLocation(data.location)}</span>
            </span>
          )}
        </WidgetBody>
      </Mini>
      <Mini label="Mail">
        <WidgetBody envelope={gmail.envelope} offline={gmail.offline}>
          {(data) => (
            <span>
              <span className="font-semibold tabular-nums">{data.unreadThreads}</span>{' '}
              <span className="text-ink-muted">unread</span>
            </span>
          )}
        </WidgetBody>
      </Mini>
      <Mini label="Next up" wide>
        <WidgetBody envelope={calendar.envelope} offline={calendar.offline}>
          {(data) => {
            const next = data.events[0];
            return next ? (
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 tabular-nums text-ink-muted">{eventLabel(next)}</span>
                <span className="truncate font-medium">{next.title}</span>
              </span>
            ) : (
              <span className="text-ink-faint">Nothing scheduled</span>
            );
          }}
        </WidgetBody>
      </Mini>
      <Mini label="Lights">
        <WidgetBody envelope={hue.envelope} offline={hue.offline}>
          {(data) => {
            const on = data.lights.filter((light) => light.on).length;
            return (
              <span>
                <span className="font-semibold tabular-nums">{on}</span>{' '}
                <span className="text-ink-muted">/ {data.lights.length} on</span>
              </span>
            );
          }}
        </WidgetBody>
      </Mini>
      <Mini label="Messages">
        <WidgetBody envelope={imessage.envelope} offline={imessage.offline}>
          {(data) => {
            const unread = data.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
            return unread > 0 ? (
              <span>
                <span className="font-semibold tabular-nums">{unread}</span>{' '}
                <span className="text-ink-muted">unread</span>
              </span>
            ) : (
              <span className="text-ink-faint">All caught up</span>
            );
          }}
        </WidgetBody>
      </Mini>
      <Mini label="Latest news" wide>
        <WidgetBody envelope={news.envelope} offline={news.offline}>
          {(data) => {
            const item = data.items[0];
            return item ? (
              <span className="flex items-baseline gap-2">
                <span className="truncate font-medium">{item.title}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-faint">
                  {relativeTime(item.publishedAt)}
                </span>
              </span>
            ) : (
              <span className="text-ink-faint">No headlines</span>
            );
          }}
        </WidgetBody>
      </Mini>
    </div>
  );
}
