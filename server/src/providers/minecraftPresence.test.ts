import { describe, expect, it } from 'vitest';
import { isSessionRunning, minecraftActivity, sessionStartedAt } from './minecraftPresence.js';

describe('sessionStartedAt', () => {
  it('dates the log\'s time-of-day stamp from the file\'s last write', () => {
    const lastWrite = new Date('2026-08-21T23:08:23');
    expect(sessionStartedAt('[23:07:52] [main/INFO]: Loading Minecraft 26.2', lastWrite))
      .toEqual(new Date('2026-08-21T23:07:52'));
  });

  it('puts a session that ran past midnight on the previous day', () => {
    const lastWrite = new Date('2026-08-22T00:40:00');
    expect(sessionStartedAt('[23:15:00] [main/INFO]: Loading Minecraft 26.2', lastWrite))
      .toEqual(new Date('2026-08-21T23:15:00'));
  });

  it('gives up on a line with no timestamp rather than inventing one', () => {
    expect(sessionStartedAt('not a log line', new Date())).toBeUndefined();
    expect(sessionStartedAt('', new Date())).toBeUndefined();
  });
});

describe('isSessionRunning', () => {
  const lastWrite = new Date('2026-08-21T23:08:23');
  const justAfter = lastWrite.getTime() + 30_000;

  it('treats a still-warm log with no shutdown marker as a live session', () => {
    expect(isSessionRunning('[23:08:22] [Render thread/INFO]: chunk saved', lastWrite, justAfter)).toBe(true);
  });

  it('believes the shutdown marker over the file being seconds old', () => {
    expect(isSessionRunning('[23:08:23] [Render thread/INFO]: Stopping!', lastWrite, justAfter)).toBe(false);
  });

  it('lets a session that went quiet for too long lapse', () => {
    expect(isSessionRunning('[23:08:22] [Render thread/INFO]: chunk saved', lastWrite, lastWrite.getTime() + 11 * 60_000)).toBe(false);
  });
});

describe('minecraftActivity', () => {
  it('identifies an integrated server as singleplayer', () => {
    expect(minecraftActivity('[Server thread/INFO]: Starting integrated minecraft server version 1.21.4'))
      .toEqual({ activity: 'singleplayer' });
  });

  it('identifies the latest multiplayer destination and preserves its nonstandard port', () => {
    expect(minecraftActivity('[Render thread/INFO]: Connecting to old.example.net, 25565\n[Render thread/INFO]: Connecting to play.example.net, 25566'))
      .toEqual({ activity: 'server', destination: 'play.example.net:25566' });
  });

  it('identifies a Realm when the client gives it a name', () => {
    expect(minecraftActivity('[Render thread/INFO]: Connecting to realm: Cozy SMP'))
      .toEqual({ activity: 'realm', destination: 'Cozy SMP' });
  });
});
