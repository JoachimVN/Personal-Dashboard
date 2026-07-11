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

const ITEMS: ArrangeableItem[] = [
  { id: 'weather', label: 'Weather', render: () => <WeatherWidget /> },
  { id: 'calendar', label: 'Calendar', render: () => <CalendarWidget /> },
  { id: 'health', label: 'Health', render: () => <HealthWidget /> },
  { id: 'gmail', label: 'Mail', render: () => <GmailWidget /> },
  { id: 'news', label: 'News', render: () => <NewsWidget /> },
  { id: 'hue', label: 'Lights', render: () => <HueWidget /> },
  { id: 'imessage', label: 'Messages', render: () => <IMessageWidget /> },
];

function PersonalSignals() {
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const next = calendar?.events[0];
  const nextEventDetail = next ? (next.allDay ? 'All day' : next.startLabel) : 'Nothing scheduled next';

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
        eyebrow="Daily briefing"
        title={<>Make space for<br /><span className="text-ink-faint">what matters.</span></>}
        description="Your day, home and incoming world—organized into one quiet place that keeps attention on the right things."
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
