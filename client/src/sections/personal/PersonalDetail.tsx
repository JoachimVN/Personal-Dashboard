import type {
  CalendarData,
  GmailData,
  HueData,
  IMessageData,
  NewsData,
  WidgetEnvelope,
} from '@personal-dashboard/shared';
import { ArrangeableWidgetGrid, type ArrangeableItem } from '../../components/ArrangeableWidgetGrid';
import { CalendarWidget } from '../../widgets/CalendarWidget';
import { GmailWidget } from '../../widgets/GmailWidget';
import { HueWidget } from '../../widgets/HueWidget';
import { IMessageWidget } from '../../widgets/IMessageWidget';
import { NewsWidget } from '../../widgets/NewsWidget';
import { SystemFooter } from '../../components/SystemFooter';
import { isWidgetDisabled } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';

const ITEMS: ArrangeableItem[] = [
  { id: 'calendar', label: 'Calendar', render: () => <CalendarWidget /> },
  { id: 'gmail', label: 'Mail', render: () => <GmailWidget /> },
  { id: 'imessage', label: 'Messages', render: () => <IMessageWidget /> },
  { id: 'news', label: 'News', render: () => <NewsWidget /> },
  { id: 'hue', label: 'Lights', render: () => <HueWidget /> },
];

/** Excludes items the user turned off in config.json, so ArrangeableWidgetGrid never lays out an empty cell for them. */
function useEnabledItems(): ArrangeableItem[] {
  const calendar = useWidget<CalendarData>('calendar');
  const gmail = useWidget<GmailData>('gmail');
  const imessage = useWidget<IMessageData>('imessage');
  const news = useWidget<NewsData>('news');
  const hue = useWidget<HueData>('hue');
  const envelopeById: Record<string, WidgetEnvelope<unknown> | null> = {
    calendar: calendar.envelope,
    gmail: gmail.envelope,
    imessage: imessage.envelope,
    news: news.envelope,
    hue: hue.envelope,
  };
  return ITEMS.filter((item) => !isWidgetDisabled(envelopeById[item.id] ?? null));
}

function PersonalSignals() {
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const imessage = useWidget<IMessageData>('imessage').envelope?.data;
  const unreadMessages = imessage?.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
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
        <span>{gmail ? `${gmail.unreadThreads} unread` : 'Mail syncing'}</span>
        {unreadMessages != null && <span>{unreadMessages > 0 ? `${unreadMessages} messages` : 'Messages clear'}</span>}
      </div>
    </div>
  );
}

export function PersonalDetail() {
  const items = useEnabledItems();
  return (
    <div>
      <DetailIntro
        eyebrow="Today"
        title={<>Calendar, mail<br /><span className="text-ink-faint">and messages.</span></>}
        description="Today's events, your inboxes, and the rest of daily life."
        accent="var(--color-accent-personal)"
      >
        <PersonalSignals />
      </DetailIntro>
      <DetailSectionHeading label="Your day" title="The complete picture" detail="Arrange the cards into the order that best matches how you move through the day." />
      <ArrangeableWidgetGrid sectionId="personal" items={items} />
      <SystemFooter />
    </div>
  );
}
