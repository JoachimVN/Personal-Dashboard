import type { CalendarData, GmailData, WeatherData } from '@personal-dashboard/shared';
import { ArrangeableWidgetGrid, type ArrangeableItem } from '../../components/ArrangeableWidgetGrid';
import { CalendarWidget } from '../../widgets/CalendarWidget';
import { GmailWidget } from '../../widgets/GmailWidget';
import { HealthWidget } from '../../widgets/HealthWidget';
import { HueWidget } from '../../widgets/HueWidget';
import { IMessageWidget } from '../../widgets/IMessageWidget';
import { NewsWidget } from '../../widgets/NewsWidget';
import { WeatherWidget } from '../../widgets/WeatherWidget';
import { SystemFooter } from '../../components/SystemFooter';
import { useWidget } from '../../useWidget';
import { deg, glyph } from '../../lib/weather';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import { sectionHref } from '../../router';

const ITEMS: ArrangeableItem[] = [
  { id: 'weather', label: 'Weather', render: () => <WeatherWidget /> },
  { id: 'calendar', label: 'Calendar', render: () => <CalendarWidget /> },
  { id: 'health', label: 'Health', render: () => <PersonalHealthEntry /> },
  { id: 'gmail', label: 'Mail', render: () => <GmailWidget /> },
  { id: 'news', label: 'News', render: () => <NewsWidget /> },
  { id: 'hue', label: 'Lights', render: () => <HueWidget /> },
  { id: 'imessage', label: 'Messages', render: () => <IMessageWidget /> },
];

function PersonalHealthEntry() {
  return (
    <div className="space-y-2">
      <HealthWidget />
      <a
        href={sectionHref('health')}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-(--color-accent-health) transition hover:bg-rose-500/10"
      >
        Full Health history <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

function PersonalSignals() {
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const next = calendar?.events[0];
  let nextEventDetail = 'Nothing scheduled next';
  if (next) {
    nextEventDetail = next.allDay ? 'All day' : next.startLabel;
  }

  return (
    <div className="detail-signal-panel grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3">
      <div className="row-span-2 text-center">
        <p className="text-4xl font-semibold tracking-[-0.07em] tabular-nums">{new Date().getDate()}</p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {new Date().toLocaleDateString('en-GB', { month: 'short' })}
        </p>
      </div>
      <div className="min-w-0 border-l border-card-border pl-5">
        <p className="truncate text-sm font-medium">{next?.title ?? 'A clear horizon'}</p>
        <p className="mt-0.5 text-[11px] text-ink-faint">{nextEventDetail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-card-border pl-5 text-xs text-ink-muted">
        <span>{weather ? `${glyph(weather.current.symbol)} ${deg(weather.current.temperature)}` : 'Weather syncing'}</span>
        <span>{gmail ? `${gmail.unreadThreads} unread` : 'Mail syncing'}</span>
      </div>
    </div>
  );
}

export function PersonalDetail() {
  return (
    <div>
      <DetailIntro
        eyebrow="Today"
        title={<>Calendar, weather<br /><span className="text-ink-faint">and inbox.</span></>}
        description="Today's events, current weather, and unread mail."
        accent="var(--color-accent-personal)"
      >
        <PersonalSignals />
      </DetailIntro>
      <DetailSectionHeading label="Your day" title="The complete picture" detail="Arrange the cards into the order that best matches how you move through the day." />
      <ArrangeableWidgetGrid sectionId="personal" items={ITEMS} />
      <SystemFooter />
    </div>
  );
}
