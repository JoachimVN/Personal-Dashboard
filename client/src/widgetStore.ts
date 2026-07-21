import type { WidgetEnvelope } from '@personal-dashboard/shared';
import { WEATHER_LOCATION_UPDATED_EVENT } from './useDeviceLocation';

const MIN_POLL_MS = 15_000;
const MAX_POLL_MS = 300_000;

export interface WidgetSnapshot<T> {
  envelope: WidgetEnvelope<T> | null;
  offline: boolean;
  refreshing: boolean;
}

type Listener = () => void;

interface WidgetRecord {
  snapshot: WidgetSnapshot<unknown>;
  listeners: Set<Listener>;
  timer: number | undefined;
  readInFlight: Promise<void> | undefined;
  refreshInFlight: Promise<void> | undefined;
  started: boolean;
}

const records = new Map<string, WidgetRecord>();

function getRecord(id: string): WidgetRecord {
  let record = records.get(id);
  if (!record) {
    record = {
      snapshot: { envelope: null, offline: false, refreshing: false },
      listeners: new Set(),
      timer: undefined,
      readInFlight: undefined,
      refreshInFlight: undefined,
      started: false,
    };
    records.set(id, record);
  }
  return record;
}

function notify(record: WidgetRecord): void {
  record.listeners.forEach((listener) => listener());
}

function setSnapshot(record: WidgetRecord, snapshot: WidgetSnapshot<unknown>): void {
  record.snapshot = snapshot;
  notify(record);
}

function pollDelay(record: WidgetRecord): number {
  return Math.min(Math.max((record.snapshot.envelope?.refreshMs ?? 60_000) / 2, MIN_POLL_MS), MAX_POLL_MS);
}

function schedulePoll(id: string, record: WidgetRecord): void {
  if (!record.started || record.timer !== undefined) return;
  record.timer = window.setTimeout(() => {
    record.timer = undefined;
    void readWidget(id);
  }, pollDelay(record));
}

async function fetchIntoRecord(id: string, record: WidgetRecord, init?: RequestInit): Promise<void> {
  try {
    const res = await fetch(`/api/widgets/${id}${init ? '/refresh' : ''}`, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope = await res.json() as WidgetEnvelope<unknown>;
    setSnapshot(record, { ...record.snapshot, envelope, offline: false });
  } catch {
    setSnapshot(record, { ...record.snapshot, offline: true });
  } finally {
    schedulePoll(id, record);
  }
}

export function readWidget(id: string): Promise<void> {
  const record = getRecord(id);
  if (!record.readInFlight) {
    record.readInFlight = fetchIntoRecord(id, record).finally(() => {
      record.readInFlight = undefined;
    });
  }
  return record.readInFlight;
}

export function refreshWidget(id: string): Promise<void> {
  const record = getRecord(id);
  if (!record.refreshInFlight) {
    setSnapshot(record, { ...record.snapshot, refreshing: true });
    record.refreshInFlight = fetchIntoRecord(id, record, { method: 'POST' }).finally(() => {
      record.refreshInFlight = undefined;
      setSnapshot(record, { ...record.snapshot, refreshing: false });
    });
  }
  return record.refreshInFlight;
}

function start(id: string, record: WidgetRecord): void {
  if (record.started) return;
  record.started = true;
  void readWidget(id);
}

function stop(record: WidgetRecord): void {
  if (!record.started || record.listeners.size) return;
  record.started = false;
  if (record.timer !== undefined) window.clearTimeout(record.timer);
  record.timer = undefined;
}

export function subscribeWidget(id: string, listener: Listener): () => void {
  const record = getRecord(id);
  record.listeners.add(listener);
  start(id, record);
  return () => {
    record.listeners.delete(listener);
    stop(record);
  };
}

export function widgetSnapshot<T>(id: string): WidgetSnapshot<T> {
  return getRecord(id).snapshot as WidgetSnapshot<T>;
}

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  records.forEach((record, id) => {
    if (record.started) void readWidget(id);
  });
});

window.addEventListener(WEATHER_LOCATION_UPDATED_EVENT, () => {
  const weather = records.get('weather');
  if (weather?.started) void readWidget('weather');
});
