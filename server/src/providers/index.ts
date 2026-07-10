import type { AppConfig } from '../config.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { createClaudeUsageProvider, createCodexUsageProvider } from './aiUsage.js';
import { createCalendarProvider } from './calendar.js';
import { createGitHubProvider } from './github.js';
import { createGmailProvider } from './gmail.js';
import { createNewsProvider } from './news.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider, type WeatherProvider } from './weather.js';

export interface Providers {
  all: Provider[];
  weather: WeatherProvider;
}

export function createProviders(env: ServerEnv, config: AppConfig): Providers {
  const weather = createWeatherProvider(env.weather, env.timezone);
  return {
    weather,
    all: [
      weather,
      createCalendarProvider(env.icloud, config.calendar.allowlist, env.timezone),
      createGmailProvider(env.google),
      createGitHubProvider(env.github, config.github.pinnedRepos),
      createClaudeUsageProvider(env.claudeOauthToken),
      createCodexUsageProvider(config.aiUsage.codexRefreshMs),
      createNewsProvider(config.news.feeds),
      createSystemProvider(env.timezone),
    ],
  };
}
