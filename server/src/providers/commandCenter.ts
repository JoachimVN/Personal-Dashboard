import {
  commandCenterSchema,
  type AiUsageToolData,
  type CalendarData,
  type GitHubData,
  type GmailData,
  type HealthData,
  type SpotifyData,
  type WidgetEnvelope,
} from '@personal-dashboard/shared';
import type { AppConfig } from '../config.js';
import { rankCandidates } from '../importance/rank.js';
import {
  aiCandidates,
  calendarCandidates,
  fallbackCandidates,
  githubCandidates,
  gmailCandidates,
  healthCandidates,
  spotifyCandidates,
} from '../importance/sources.js';
import type { ProviderScheduler, Provider } from '../scheduler.js';
import { SignalHistoryStore } from '../signalHistory.js';

function widgetData<T>(envelopes: Record<string, WidgetEnvelope>, id: string): T | undefined {
  const envelope = envelopes[id];
  return envelope?.status === 'ready' || envelope?.status === 'stale' ? envelope.data as T | undefined : undefined;
}

export function createCommandCenterProvider(
  scheduler: ProviderScheduler,
  signalHistory: SignalHistoryStore,
  config: AppConfig,
): Provider {
  return {
    id: 'command-center',
    schema: commandCenterSchema,
    refreshMs: 60_000,
    timeoutMs: 5_000,
    isConfigured: () => true,
    async fetch() {
      const envelopes = scheduler.getAllEnvelopes();
      const gmail = widgetData<GmailData>(envelopes, 'gmail');
      if (gmail) await signalHistory.record('gmail', 'unreadThreads', gmail.unreadThreads);
      const gmailChangedAt = await signalHistory.lastChangedAt('gmail', 'unreadThreads');
      const staleForMs = gmailChangedAt ? Date.now() - gmailChangedAt.getTime() : undefined;
      const github = widgetData<GitHubData>(envelopes, 'github');
      return rankCandidates([
        ...calendarCandidates(widgetData<CalendarData>(envelopes, 'calendar'), Date.now()),
        ...gmailCandidates(gmail, staleForMs, config.commandCenter.gmailStaleMs),
        ...githubCandidates(github),
        ...healthCandidates(widgetData<HealthData>(envelopes, 'health')),
        ...spotifyCandidates(widgetData<SpotifyData>(envelopes, 'spotify'), github),
        ...aiCandidates([
          widgetData<AiUsageToolData>(envelopes, 'ai-usage-claude'),
          widgetData<AiUsageToolData>(envelopes, 'ai-usage-codex'),
        ]),
        ...fallbackCandidates(),
      ]);
    },
  };
}
