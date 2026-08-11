import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Response } from 'express';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProviderScheduler } from './scheduler.js';
import { createWidgetEventStream, type WidgetEventStream } from './widgetEvents.js';

let running: Server | undefined;
let stream: WidgetEventStream | undefined;

async function start(): Promise<{ baseUrl: string; stream: WidgetEventStream }> {
  stream = createWidgetEventStream();
  const app = express();
  app.get('/api/events', stream.handler);
  running = await new Promise<Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  return { baseUrl: `http://127.0.0.1:${(running.address() as AddressInfo).port}`, stream };
}

/** Reads the open stream until `matches` is satisfied, so tests never wait on a fixed delay. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  matches: (text: string) => boolean,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!matches(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

afterEach(async () => {
  stream?.close();
  stream = undefined;
  if (!running) return;
  const server = running;
  running = undefined;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createWidgetEventStream', () => {
  it('delivers a settled frame naming the widget that changed', async () => {
    const { baseUrl, stream: events } = await start();
    const response = await fetch(`${baseUrl}/api/events`);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    await readUntil(reader, (t) => t.includes('retry:'));
    events.broadcast('health');
    const text = await readUntil(reader, (t) => t.includes('event: settled'));

    expect(text).toContain('event: settled');
    expect(text).toContain('"id":"health"');
    await reader.cancel();
  });

  it('forgets a client once it disconnects', async () => {
    const { baseUrl, stream: events } = await start();
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    const reader = response.body!.getReader();
    await readUntil(reader, (t) => t.includes('retry:'));
    expect(events.clientCount).toBe(1);

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events.clientCount).toBe(0);
  });

  it('reaches a connected browser when a real provider settles', async () => {
    // The wiring index.ts performs, end to end: scheduler refresh -> settle hook -> SSE frame.
    const events = createWidgetEventStream();
    const scheduler = new ProviderScheduler();
    scheduler.onSettled((id) => events.broadcast(id));
    scheduler.register({
      id: 'health',
      schema: z.object({ steps: z.number() }),
      refreshMs: 60_000,
      timeoutMs: 1_000,
      isConfigured: () => true,
      fetch: async () => ({ steps: 5996 }),
    });

    const app = express();
    app.get('/api/events', events.handler);
    running = await new Promise<Server>((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    stream = events;

    const response = await fetch(`http://127.0.0.1:${(running.address() as AddressInfo).port}/api/events`);
    const reader = response.body!.getReader();
    await readUntil(reader, (t) => t.includes('retry:'));

    await scheduler.refresh('health');
    const text = await readUntil(reader, (t) => t.includes('event: settled'));

    expect(text).toContain('"id":"health"');
    await reader.cancel();
  });

  it('broadcasting with nobody connected is a no-op', async () => {
    const { stream: events } = await start();
    expect(() => events.broadcast('health')).not.toThrow();
  });

  it('drops a client that throws on write instead of failing the whole broadcast', () => {
    // Registered through the real handler with stub sockets: reproducing a half-open connection
    // over TCP is racy, and the guarantee under test is that one dead client cannot silence others.
    const events = createWidgetEventStream();
    const fakeReq = { on: () => {} } as never;
    const stubRes = (write: (frame: string) => void) =>
      ({ writeHead: () => {}, flushHeaders: () => {}, end: () => {}, write }) as unknown as Response;

    let brokenWrites = 0;
    events.handler(fakeReq, stubRes(() => {
      brokenWrites += 1;
      if (brokenWrites > 1) throw new Error('socket gone'); // survives the opening retry frame
    }));
    const delivered: string[] = [];
    events.handler(fakeReq, stubRes((frame) => delivered.push(frame)));
    expect(events.clientCount).toBe(2);

    expect(() => events.broadcast('health')).not.toThrow();

    expect(delivered.some((frame) => frame.includes('"id":"health"'))).toBe(true);
    expect(events.clientCount).toBe(1);
    events.close();
  });
});
