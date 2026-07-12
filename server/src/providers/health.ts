import { healthSchema, type HealthData } from '@personal-dashboard/shared';
import type { HealthStore } from '../healthStore.js';
import type { Provider } from '../scheduler.js';

/** YYYY-MM-DD in the dashboard's timezone — matches the date the Shortcut/store key on. */
export function todayInZone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

export function createHealthProvider(
  store: HealthStore,
  timezone: string,
  goals: { steps: number; activeEnergyKcal: number; exerciseMinutes: number; standHours: number },
): Provider<HealthData> {
  return {
    id: 'health',
    schema: healthSchema,
    // Data only changes on ingest (which triggers an immediate refresh); this slow poll
    // just rolls "today" over at midnight and re-serves the local store.
    refreshMs: 5 * 60_000,
    timeoutMs: 5_000,
    isConfigured: () => true,
    async fetch() {
      return { ...store.snapshot(todayInZone(timezone)), goals };
    },
  };
}
