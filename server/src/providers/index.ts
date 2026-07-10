import type { AppConfig } from '../config.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { createAiUsageProvider } from './aiUsage.js';
import { createCalendarProvider } from './calendar.js';
import { createGitHubProvider } from './github.js';
import { createGmailProvider } from './gmail.js';
import { createNewsProvider } from './news.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider } from './weather.js';

export function createProviders(env: ServerEnv, config: AppConfig): Provider[] {
  return [
    createWeatherProvider(env.weather, env.timezone),
    createCalendarProvider(env.icloud, config.calendar.allowlist, env.timezone),
    createGmailProvider(env.google),
    createGitHubProvider(env.github, config.github.pinnedRepos),
    createAiUsageProvider(env.timezone),
    createNewsProvider(config.news.feeds),
    createSystemProvider(env.timezone),
  ];
}
