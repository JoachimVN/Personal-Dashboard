import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HealthStore } from './healthStore.js';

describe('HealthStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'health-store-'));
    filePath = path.join(dir, 'health.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the higher device total without adding overlapping step counts', () => {
    const store = new HealthStore(filePath, 30);

    const day = store.ingest({ watchSteps: 7_100, phoneSteps: 5_800 }, '2026-07-13');

    expect(day).toMatchObject({ steps: 7_100, watchSteps: 7_100, phoneSteps: 5_800 });
  });

  it('recalculates the daily total when device sources arrive in separate posts', () => {
    const store = new HealthStore(filePath, 30);
    store.ingest({ phoneSteps: 6_500 }, '2026-07-13');

    const day = store.ingest({ watchSteps: 8_200 }, '2026-07-13');

    expect(day).toMatchObject({ steps: 8_200, watchSteps: 8_200, phoneSteps: 6_500 });
  });

  it('keeps legacy steps when no device-specific values are supplied', () => {
    const store = new HealthStore(filePath, 30);

    expect(store.ingest({ steps: 4_200 }, '2026-07-13')).toMatchObject({ steps: 4_200 });
  });
});
