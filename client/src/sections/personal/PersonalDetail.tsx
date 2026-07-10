import { CalendarWidget } from '../../widgets/CalendarWidget';
import { GmailWidget } from '../../widgets/GmailWidget';
import { NewsWidget } from '../../widgets/NewsWidget';
import { WeatherWidget } from '../../widgets/WeatherWidget';
import { SystemFooter } from '../../components/SystemFooter';

export function PersonalDetail() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeatherWidget />
        <CalendarWidget />
        <GmailWidget />
        <NewsWidget />
      </div>
      <SystemFooter />
    </div>
  );
}
