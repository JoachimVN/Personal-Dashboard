import { ArrangeableWidgetGrid, type ArrangeableItem } from '../../components/ArrangeableWidgetGrid';
import { CalendarWidget } from '../../widgets/CalendarWidget';
import { GmailWidget } from '../../widgets/GmailWidget';
import { HueWidget } from '../../widgets/HueWidget';
import { IMessageWidget } from '../../widgets/IMessageWidget';
import { NewsWidget } from '../../widgets/NewsWidget';
import { WeatherWidget } from '../../widgets/WeatherWidget';
import { SystemFooter } from '../../components/SystemFooter';

const ITEMS: ArrangeableItem[] = [
  { id: 'weather', label: 'Weather', render: () => <WeatherWidget /> },
  { id: 'calendar', label: 'Calendar', render: () => <CalendarWidget /> },
  { id: 'gmail', label: 'Mail', render: () => <GmailWidget /> },
  { id: 'news', label: 'News', render: () => <NewsWidget /> },
  { id: 'hue', label: 'Lights', render: () => <HueWidget /> },
  { id: 'imessage', label: 'Messages', render: () => <IMessageWidget /> },
];

export function PersonalDetail() {
  return (
    <div>
      <ArrangeableWidgetGrid sectionId="personal" items={ITEMS} />
      <SystemFooter />
    </div>
  );
}
