import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { UsageHistoryStore } from '../usageHistory.js';
import { createClaudeUsageProvider, createCodexUsageProvider } from './aiUsage.js';
import { createCalendarProvider } from './calendar.js';
import { createGitHubProvider } from './github.js';
import { createGmailProvider } from './gmail.js';
import { createHueProvider, type HueProvider } from './hue.js';
import { createNewsProvider } from './news.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider, type WeatherProvider } from './weather.js';

export interface Providers {
  all: Provider[];
  weather: WeatherProvider;
  hue: HueProvider;
}

export function createProviders(env: ServerEnv, config: AppConfig): Providers {
  const weather = createWeatherProvider(env.weather, env.timezone);
  const hue = createHueProvider(env.hue);
  const usageHistory = new UsageHistoryStore(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data/ai-usage-history.json'),
    config.aiUsage.historySampleMs,
    config.aiUsage.historyRetentionDays * 24 * 60 * 60_000,
  );
  return {
    weather,
    hue,
    all: [
      weather,
      createCalendarProvider(env.icloud, config.calendar.allowlist, env.timezone),
      createGmailProvider(env.google),
      createGitHubProvider(env.github),
      createClaudeUsageProvider(env.claudeOauthToken, usageHistory),
      createCodexUsageProvider(config.aiUsage.codexRefreshMs, usageHistory),
      createNewsProvider(config.news.feeds),
      createSystemProvider(env.timezone),
      hue,
    ],
  };
}
