import type { Request, Response } from 'express';

/** Comment frame keeping proxies and phone radios from closing an idle stream. */
const HEARTBEAT_MS = 25_000;
/** Browsers reconnect on their own; this only sets how soon. */
const CLIENT_RETRY_MS = 5_000;

/**
 * Server-sent events announcing which widget just settled.
 *
 * The client used to learn about new data only by polling every `refreshMs / 2`, so a provider that
 * refreshed a second after a poll sat unseen for the rest of the interval. Now the scheduler's
 * settle hook drives the browser directly.
 *
 * Only the widget's id goes over the wire, not its envelope: the client already has a fetch path
 * with its own timeout, offline and error handling (`widgetStore.readWidget`), and reusing it keeps
 * one code path for reading a widget instead of two that can disagree.
 */
export function createWidgetEventStream() {
  const clients = new Set<Response>();

  function handler(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // The dashboard is served from this same origin behind `tailscale serve`, which buffers
      // proxied responses by default; this asks it not to hold the stream.
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: ${CLIENT_RETRY_MS}\n\n`);
    // Flushing matters: without it the headers can sit in the socket buffer and the browser's
    // EventSource stays in CONNECTING, so the first settle looks like a dropped event.
    res.flushHeaders?.();
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
  }

  function broadcast(widgetId: string): void {
    if (!clients.size) return;
    const frame = `event: settled\ndata: ${JSON.stringify({ id: widgetId })}\n\n`;
    for (const client of clients) {
      // A client that vanished without its close event firing would otherwise throw here and take
      // down the settle hook for everyone else.
      try {
        client.write(frame);
      } catch {
        clients.delete(client);
      }
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      try {
        client.write(': ping\n\n');
      } catch {
        clients.delete(client);
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  function close(): void {
    clearInterval(heartbeat);
    for (const client of clients) client.end();
    clients.clear();
  }

  return { handler, broadcast, close, get clientCount() { return clients.size; } };
}

export type WidgetEventStream = ReturnType<typeof createWidgetEventStream>;
