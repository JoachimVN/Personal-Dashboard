import { AiUsageWidget } from './widgets/AiUsageWidget';
import { CalendarWidget } from './widgets/CalendarWidget';
import {
  ContributionsWidget,
  GitHubActivityWidget,
  GitHubWorkWidget,
  RepoHealthWidget,
} from './widgets/GitHubWidgets';
import { SystemWidget } from './widgets/SystemWidget';
import { WeatherWidget } from './widgets/WeatherWidget';

export function Dashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <CalendarWidget />
      <WeatherWidget />
      <GitHubActivityWidget />
      <GitHubWorkWidget />
      <AiUsageWidget />
      <ContributionsWidget />
      <RepoHealthWidget />
      <SystemWidget />
    </div>
  );
}
