import type { ServerEnv } from '../env.js';
import type { Provider } from '../scheduler.js';
import { createSystemProvider } from './system.js';

export function createProviders(env: ServerEnv): Provider[] {
  return [createSystemProvider(env.timezone)];
}
