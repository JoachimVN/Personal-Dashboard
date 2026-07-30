import type { CalendarData, CommandCenterData, HealthData } from '@personal-dashboard/shared';

// ── Command center (hand-composed hero/secondary/tiles referencing the fixtures above) ─────────

export function commandCenter(now: Date, cal: CalendarData, hlth: HealthData): CommandCenterData {
  const heroEvent = cal.events.find((e) => Date.parse(e.end) > now.getTime()) ?? cal.events[0];
  return {
    hero: {
      id: 'calendar:hero', source: 'calendar', kind: 'calendar', kicker: 'Coming up', title: heroEvent.title,
      detail: heroEvent.description ?? heroEvent.location ?? '', href: '#/personal', score: 100,
      render: { type: 'calendar-event', eventId: heroEvent.id },
    },
    secondary: [
      {
        id: 'spotify:now-playing', source: 'spotify', kind: 'spotify', kicker: 'Now playing', title: 'Levitating',
        detail: 'Dua Lipa', href: '#/spotify', score: 90, render: { type: 'spotify-now-playing' },
      },
      {
        id: 'github:open-pr:personal-dashboard:31', source: 'github', kind: 'github', kicker: '2 open pull requests',
        title: 'Show issue counts alongside SonarQube rating grades', detail: 'personal-dashboard', href: '#/github', score: 50,
        render: { type: 'github-open-prs' },
      },
      {
        id: 'sonar:failed:weekend-project', source: 'sonar', kind: 'sonar', kicker: 'Quality gate failed',
        title: 'weekend-project', detail: 'SonarCloud', href: '#/github', score: 78,
        render: { type: 'sonar-quality-gate', status: 'failed', projects: [{ key: 'weekend-project', name: 'weekend-project' }] },
      },
    ],
    tiles: [
      {
        id: 'health:rings', source: 'health', kind: 'health', kicker: 'Today', title: `${hlth.today?.steps ?? 0} steps`,
        detail: 'On track for your goals', href: '#/health', score: 80, render: { type: 'health-rings' },
      },
      {
        id: 'github:contributions', source: 'github', kind: 'github', kicker: 'GitHub', title: '3 commits today',
        detail: 'personal-dashboard', href: '#/github', score: 75, render: { type: 'github-contributions' },
      },
      {
        id: 'ai-usage:claude', source: 'ai-usage', kind: 'ai-usage', kicker: 'Claude', title: '54% of 5h window',
        detail: 'Resets in 2h', href: '#/ai', score: 65, accent: 'claude', meter: 54,
        render: { type: 'ai-usage-tool', toolIds: ['claude'], metric: 'fiveHour' },
      },
    ],
  };
}

