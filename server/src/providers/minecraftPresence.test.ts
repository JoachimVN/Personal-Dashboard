import { describe, expect, it } from 'vitest';
import { isSessionRunning, minecraftActivity, nextScanFrom, reconcileActivity, sessionStartedAt, telemetryActivity } from './minecraftPresence.js';

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

  it('keeps a quiet session live while the Minecraft client process is still running', () => {
    expect(isSessionRunning('[23:08:22] [Render thread/INFO]: chunk saved', lastWrite, lastWrite.getTime() + 11 * 60_000, true)).toBe(true);
  });

  it('still believes a clean shutdown marker while the client process exits', () => {
    expect(isSessionRunning('[23:08:23] [Render thread/INFO]: Stopping!', lastWrite, justAfter, true)).toBe(false);
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

  it('names the singleplayer world from the autosave line, which repeats all session', () => {
    expect(minecraftActivity(`[15:34:33] [Server thread/INFO]: Saving chunks for level 'ServerLevel[Salamalecomalecosalam (World 3)-2]'/minecraft:overworld`))
      .toEqual({ activity: 'singleplayer', destination: 'Salamalecomalecosalam (World 3)-2' });
  });

  it('reads the older logs that name the level without wrapping it', () => {
    expect(minecraftActivity(`[15:34:33] [Server thread/INFO]: Saving chunks for level 'New World'/minecraft:overworld`))
      .toEqual({ activity: 'singleplayer', destination: 'New World' });
  });

  it('prefers the server joined after a singleplayer world was left', () => {
    const log = `[15:34:33] [Server thread/INFO]: Saving chunks for level 'ServerLevel[Home]'/minecraft:overworld
[15:40:02] [Render thread/INFO]: Connecting to play.example.net, 25565`;
    expect(minecraftActivity(log)).toEqual({ activity: 'server', destination: 'play.example.net' });
  });

  it('names the destination from a mod save path when the client logs no join line at all', () => {
    const tail = String.raw`[Render thread/INFO]: Started DHLevel for Wrapped{ClientLevel@abc@minecraft:overworld} with saves at [ClientOnlySaveStructure@(C:\Users\me\AppData\Roaming\ModrinthApp\profiles\Fabric 26.2\Distant_Horizons_server_data\Cozy Realm\abc@minecraft@@overworld)]`;
    expect(minecraftActivity(tail)).toEqual({ activity: 'server', destination: 'Cozy Realm' });
  });
});

describe('telemetryActivity', () => {
  const since = Date.parse('2026-08-23T11:00:00Z');
  const worldLoaded = (serverType: string, at: string): string =>
    JSON.stringify({ type: 'world_loaded', server_type: serverType, event_timestamp_utc: at });

  it('reads a Realm out of the join event the client log never writes', () => {
    expect(telemetryActivity(worldLoaded('realm', '2026-08-23T11:37:37.451Z'), since)).toBe('realm');
  });

  it('maps a local world to singleplayer and anything else to a server', () => {
    expect(telemetryActivity(worldLoaded('local', '2026-08-23T11:37:37Z'), since)).toBe('singleplayer');
    expect(telemetryActivity(worldLoaded('third_party_server', '2026-08-23T11:37:37Z'), since)).toBe('server');
  });

  it('takes the latest join, so leaving a Realm for a server is not missed', () => {
    const events = [worldLoaded('realm', '2026-08-23T11:37:37Z'), worldLoaded('third_party_server', '2026-08-23T12:10:00Z')];
    expect(telemetryActivity(events.join('\n'), since)).toBe('server');
  });

  it('ignores joins from before this session and events of other kinds', () => {
    expect(telemetryActivity(worldLoaded('realm', '2026-08-23T09:00:00Z'), since)).toBeUndefined();
    expect(telemetryActivity(JSON.stringify({ type: 'graphics_capabilities', event_timestamp_utc: '2026-08-23T11:37:00Z' }), since)).toBeUndefined();
  });

  it('survives the incomplete final line of a log being appended to', () => {
    expect(telemetryActivity(`${worldLoaded('realm', '2026-08-23T11:37:37Z')}\n{"type":"world_loa`, since)).toBe('realm');
  });

  it('reports nothing when there is no telemetry to read', () => {
    expect(telemetryActivity('', since)).toBeUndefined();
  });
});

describe('reconcileActivity', () => {
  it('keeps a mod-derived name but corrects the kind telemetry knows better', () => {
    expect(reconcileActivity({ activity: 'server', destination: 'Cozy Realm' }, 'realm'))
      .toEqual({ activity: 'realm', destination: 'Cozy Realm' });
  });

  it('drops a name that cannot belong to the destination telemetry reports', () => {
    expect(reconcileActivity({ activity: 'server', destination: 'play.example.net' }, 'singleplayer'))
      .toEqual({ activity: 'singleplayer' });
  });

  it('labels a session the log said nothing about', () => {
    expect(reconcileActivity({}, 'realm')).toEqual({ activity: 'realm' });
  });

  it('leaves the log reading alone when telemetry has nothing to say', () => {
    expect(reconcileActivity({ activity: 'server', destination: 'play.example.net' }, undefined))
      .toEqual({ activity: 'server', destination: 'play.example.net' });
  });
});

describe('nextScanFrom', () => {
  const scanned = { file: 'a/latest.log', scannedTo: 100_000, activity: { activity: 'realm' as const, destination: 'Cozy SMP' } };

  it('reads a log it has never seen from the beginning', () => {
    expect(nextScanFrom(undefined, 'a/latest.log', 100_000)).toEqual({ from: 0, carried: {} });
    expect(nextScanFrom(scanned, 'b/latest.log', 100_000)).toEqual({ from: 0, carried: {} });
  });

  it('starts over when the log shrank, because that is a new session in the same file', () => {
    expect(nextScanFrom(scanned, 'a/latest.log', 4_000)).toEqual({ from: 0, carried: {} });
  });

  it('resumes just behind where it stopped and keeps what it already knew', () => {
    expect(nextScanFrom(scanned, 'a/latest.log', 140_000)).toEqual({ from: 95_904, carried: scanned.activity });
  });
});
