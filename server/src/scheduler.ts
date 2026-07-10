import { ZodError, type ZodType } from 'zod';
import type { WidgetEnvelope, WidgetStatus, WidgetSummary } from '@personal-dashboard/shared';

export interface Provider<T = unknown> {
  id: string;
  /** Output is validated against this before caching; failures follow the error/stale rules. */
  schema: ZodType<T>;
  refreshMs: number;
  timeoutMs: number;
  /** false → status "disabled", never fetched (missing credentials/config). */
  isConfigured(): boolean;
  fetch(signal: AbortSignal): Promise<T>;
}

interface Entry {
  provider: Provider;
  status: WidgetStatus;
  data?: unknown;
  fetchedAt?: Date;
  lastAttemptAt?: Date;
  error?: string;
  inFlight: boolean;
  refreshPromise?: Promise<void>;
  timer?: NodeJS.Timeout;
}

/** Map any failure to a safe category string — raw errors can leak tokens/URLs. */
function sanitizeError(err: unknown): string {
  if (err instanceof ZodError) return 'invalid-response';
  if (err instanceof Error && err.name === 'AbortError') return 'timeout';
  return 'fetch-failed';
}

export class ProviderScheduler {
  private entries = new Map<string, Entry>();

  register(provider: Provider): void {
    if (this.entries.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this.entries.set(provider.id, {
      provider,
      status: provider.isConfigured() ? 'loading' : 'disabled',
      inFlight: false,
    });
  }

  /** Immediate fetch for every configured provider, then per-provider intervals. */
  start(): void {
    for (const entry of this.entries.values()) {
      if (entry.status === 'disabled') continue;
      void this.refresh(entry.provider.id);
      entry.timer = setInterval(
        () => void this.refresh(entry.provider.id),
        entry.provider.refreshMs,
      );
      entry.timer.unref?.();
    }
  }

  stop(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) clearInterval(entry.timer);
    }
  }

  /** Single-flight: a refresh while the previous one is running is a no-op. */
  refresh(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.status === 'disabled') return Promise.resolve();
    if (entry.inFlight) return entry.refreshPromise ?? Promise.resolve();

    entry.inFlight = true;
    entry.refreshPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), entry.provider.timeoutMs);
      timeout.unref?.();
      try {
        const raw = await entry.provider.fetch(controller.signal);
        entry.data = entry.provider.schema.parse(raw);
        entry.fetchedAt = new Date();
        entry.status = 'ready';
        entry.error = undefined;
      } catch (err) {
        // Timeout surfaces as AbortError regardless of how the provider failed.
        const error = controller.signal.aborted
          ? 'timeout'
          : sanitizeError(err);
        entry.error = error;
        entry.status = entry.data !== undefined ? 'stale' : 'error';
        console.error(`[${id}] refresh failed (${error}):`, err);
      } finally {
        clearTimeout(timeout);
        entry.lastAttemptAt = new Date();
        entry.inFlight = false;
        entry.refreshPromise = undefined;
      }
    })();

    return entry.refreshPromise;
  }

  getEnvelope(id: string): WidgetEnvelope | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return {
      id,
      status: entry.status,
      data: entry.data,
      fetchedAt: entry.fetchedAt?.toISOString(),
      lastAttemptAt: entry.lastAttemptAt?.toISOString(),
      error: entry.error,
      refreshMs: entry.provider.refreshMs,
    };
  }

  list(): WidgetSummary[] {
    return [...this.entries.values()].map((entry) => ({
      id: entry.provider.id,
      status: entry.status,
      fetchedAt: entry.fetchedAt?.toISOString(),
      refreshMs: entry.provider.refreshMs,
    }));
  }
}
