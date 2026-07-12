import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { HealthStore } from '../healthStore.js';
import { UsageHistoryStore } from '../usageHistory.js';
import { createClaudeUsageProvider, createCodexUsageProvider } from './aiUsage.js';
import { createCalendarProvider } from './calendar.js';
import { createGitHubProvider } from './github.js';
import { createGmailProvider } from './gmail.js';
import { createHealthProvider } from './health.js';
import { createHueProvider, type HueProvider } from './hue.js';
import { createIMessageProvider } from './imessage.js';
import { createNewsProvider } from './news.js';
import { createSpotifyProvider } from './spotify.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider, type WeatherProvider } from './weather.js';

export interface Providers {
  all: Provider[];
  weather: WeatherProvider;
  hue: HueProvider;
  health: HealthStore;
}

export function createProviders(env: ServerEnv, config: AppConfig): Providers {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data');
  const weather = createWeatherProvider(env.weather, env.timezone);
  const hue = createHueProvider(env.hue);
  const health = new HealthStore(
    path.join(dataDir, 'health.json'),
    config.health.historyRetentionDays,
  );
  const usageHistory = new UsageHistoryStore(
    path.join(dataDir, 'ai-usage-history.json'),
    config.aiUsage.historySampleMs,
    config.aiUsage.historyRetentionDays * 24 * 60 * 60_000,
  );
  return {
    weather,
    hue,
    health,
    all: [
      weather,
      createCalendarProvider(env.icloud, config.calendar.allowlist, env.timezone),
      createGmailProvider(env.google),
      createGitHubProvider(env.github),
      createClaudeUsageProvider(config.aiUsage.claudeRefreshMs, usageHistory),
      createCodexUsageProvider(config.aiUsage.codexRefreshMs, usageHistory),
      createNewsProvider(config.news.feeds),
      createSpotifyProvider(env.spotify),
      createHealthProvider(health, env.timezone, {
        steps: config.health.stepGoal,
        exerciseMinutes: config.health.exerciseGoalMinutes,
      }),
      createSystemProvider(env.timezone),
      hue,
      createIMessageProvider(),
    ],
  };
}
