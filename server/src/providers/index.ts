import type { AppConfig } from '../config.js';
import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { createGitHubProvider } from './github.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider } from './weather.js';

export function createProviders(env: ServerEnv, config: AppConfig): Provider[] {
  return [
    createWeatherProvider(env.weather, env.timezone),
    createGitHubProvider(env.github, config.github.pinnedRepos),
    createSystemProvider(env.timezone),
  ];
}
