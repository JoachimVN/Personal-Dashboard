import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codexAccountSnapshot, parseCodexAccountLimits } from './codexAccount.js';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('./shared.js', async (original) => ({
  ...await original<typeof import('./shared.js')>(),
  resolveProbeExecutable: async () => '/codex',
}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const window = (usedPercent: number, windowDurationMins: number) => ({ usedPercent, windowDurationMins, resetsAt: 1791723600 });
describe('parseCodexAccountLimits', () => {
  it('prefers account limits over the legacy model-specific bucket and classifies reversed slots', () => {
    const quota = parseCodexAccountLimits({
      rateLimits: { primary: window(99, 300) },
      rateLimitsByLimitId: { codex: { primary: window(28, 10080), secondary: window(48, 300) } },
    });
    expect(quota.fiveHour?.usedPercent).toBe(48);
    expect(quota.weekly?.usedPercent).toBe(28);
  });
  it('supports older single-bucket responses', () => {
    expect(parseCodexAccountLimits({ rateLimits: { primary: window(3, 300) } }).fiveHour?.usedPercent).toBe(3);
  });
  it('keeps unavailable or incomplete quota windows unknown', () => {
    expect(parseCodexAccountLimits({ rateLimits: null }).available).toBe(false);
    expect(parseCodexAccountLimits({ rateLimits: { primary: { ...window(3, 300), resetsAt: null } } }).asOf).toBeUndefined();
  });
});

function childProcess() {
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { write: vi.fn() }),
    stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    kill: vi.fn(),
  });
  spawnMock.mockReturnValue(child);
  return child;
}
describe('codexAccountSnapshot', () => {
  it('initializes before reading account limits and handles fragmented JSON lines', async () => {
    const child = childProcess();
    const result = codexAccountSnapshot();
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    child.stdout.emit('data', '{"id":1,"res');
    expect(child.stdin.write).toHaveBeenCalledOnce();
    child.stdout.emit('data', 'ult":{}}\n');
    expect(child.stdin.write.mock.calls.slice(1).map(([line]) => JSON.parse(line).method)).toEqual(['initialized', 'account/rateLimits/read']);
    child.stdout.emit('data', JSON.stringify({ id: 2, result: { rateLimits: { primary: window(8, 300) } } }) + '\n');
    expect((await result).fiveHour?.usedPercent).toBe(8);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(spawnMock.mock.calls[0][2]).toMatchObject({ windowsHide: true });
  });
  it('kills the process and returns unavailable limits when the caller aborts', async () => {
    const child = childProcess();
    const controller = new AbortController();
    const result = codexAccountSnapshot(controller.signal);
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    controller.abort();
    expect((await result).available).toBe(false);
    expect(child.kill).toHaveBeenCalledOnce();
  });
  it('does not hang on an RPC error', async () => {
    const child = childProcess();
    const result = codexAccountSnapshot();
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    child.stdout.emit('data', '{"id":1,"error":{"message":"unavailable"}}\n');
    expect((await result).asOf).toBeUndefined();
  });
});
