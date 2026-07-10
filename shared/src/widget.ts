export const WIDGET_STATUSES = [
  'loading',
  'ready',
  'stale',
  'error',
  'disabled',
] as const;

export type WidgetStatus = (typeof WIDGET_STATUSES)[number];

/**
 * What the server returns for a widget. `data` is present for `ready` and
 * `stale`; `error` is a sanitized category string, never a raw error.
 */
export interface WidgetEnvelope<T = unknown> {
  id: string;
  status: WidgetStatus;
  data?: T;
  /** ISO timestamp of the last successful fetch. */
  fetchedAt?: string;
  /** ISO timestamp of the last fetch attempt, successful or not. */
  lastAttemptAt?: string;
  error?: string;
  /** Server-side refresh interval; the client derives its poll rate from it. */
  refreshMs: number;
}

export interface WidgetSummary {
  id: string;
  status: WidgetStatus;
  fetchedAt?: string;
  refreshMs: number;
}
