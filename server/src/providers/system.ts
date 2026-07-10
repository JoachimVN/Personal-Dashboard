import os from 'node:os';
import { systemSchema, type SystemData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

/** Zero-config provider that proves the pipeline; also handy on the dashboard. */
export function createSystemProvider(timezone: string): Provider<SystemData> {
  return {
    id: 'system',
    schema: systemSchema,
    refreshMs: 60_000,
    timeoutMs: 5_000,
    isConfigured: () => true,
    async fetch() {
      return {
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        timezone,
        serverTime: new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'medium',
          timeZone: timezone,
        }).format(new Date()),
      };
    },
  };
}
