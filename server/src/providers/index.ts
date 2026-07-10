import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { createSystemProvider } from './system.js';
import { createWeatherProvider } from './weather.js';

export function createProviders(env: ServerEnv): Provider[] {
  return [
    createWeatherProvider(env.weather, env.timezone),
    createSystemProvider(env.timezone),
  ];
}
