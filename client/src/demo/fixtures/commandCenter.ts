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
        id: 'roblox:now-playing', source: 'roblox', kind: 'roblox', kicker: 'Roblox', title: 'Jailbreak',
        detail: 'In game right now', href: 'https://www.roblox.com/home', score: 70,
        render: { type: 'roblox-now-playing' },
      },
      {
        id: 'gmail:threads', source: 'gmail', kind: 'gmail', kicker: 'Inbox', title: '5 unread',
        detail: 'Newsletter, GitHub review request and 3 more', href: '#/personal', score: 60,
        render: { type: 'gmail-threads', threadIds: ['t1', 't2', 't4'] },
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
