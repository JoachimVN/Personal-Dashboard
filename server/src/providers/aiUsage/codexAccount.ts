import { spawn } from 'node:child_process';
import os from 'node:os';
import { z } from 'zod';
import { limit, limitStatus, ptyProbeEnv, resolveProbeExecutable, type UsageSnapshot } from './shared.js';

const windowSchema = z.object({
  usedPercent: z.number().finite(),
  windowDurationMins: z.number().positive().nullish(),
  resetsAt: z.number().finite().nullish(),
});
const limitsSchema = z.object({
  primary: windowSchema.nullish(),
  secondary: windowSchema.nullish(),
});
const responseSchema = z.object({
  rateLimits: limitsSchema.nullish(),
  rateLimitsByLimitId: z.record(z.string(), limitsSchema).nullish(),
});

/** Prefer the account bucket; model-specific quotas must not replace account-wide usage. */
export function parseCodexAccountLimits(value: unknown, now = new Date()): UsageSnapshot {
  const result = responseSchema.parse(value);
  const report = result.rateLimitsByLimitId?.codex ?? result.rateLimits;
  let fiveHour: UsageSnapshot['fiveHour'];
  let weekly: UsageSnapshot['weekly'];
  for (const entry of [report?.primary, report?.secondary]) {
    if (!entry?.windowDurationMins || entry.resetsAt == null) continue;
    if (entry.windowDurationMins <= 600) fiveHour = limit(entry.usedPercent, entry.resetsAt);
    if (entry.windowDurationMins >= 5000 && entry.windowDurationMins <= 20000) weekly = limit(entry.usedPercent, entry.resetsAt);
  }
  const available = Boolean(fiveHour || weekly);
  return {
    available, fiveHour, weekly,
    fiveHourStatus: limitStatus(Boolean(fiveHour), available),
    weeklyStatus: limitStatus(Boolean(weekly), available),
    asOf: available ? now.toISOString() : undefined,
  };
}

/** Read live account limits without opening a thread, starting MCPs, or scraping a terminal. */
export async function codexAccountSnapshot(signal?: AbortSignal): Promise<UsageSnapshot> {
  const unknown: UsageSnapshot = { available: false, fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  if (signal?.aborted) return unknown;
  try {
    const executable = await resolveProbeExecutable('codex');
    return await new Promise<UsageSnapshot>((resolve) => {
      const child = spawn(executable, ['--no-daemon', 'app-server', '--listen', 'stdio://'], {
        // Account reads don't need project configuration or workspace startup hooks.
        cwd: os.tmpdir(), env: ptyProbeEnv(process.env), windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      let buffer = '';
      let settled = false;
      const finish = (snapshot = unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        child.kill();
        resolve(snapshot);
      };
      const abort = () => finish();
      const timeout = setTimeout(abort, 15_000);
      signal?.addEventListener('abort', abort, { once: true });
      child.on('error', abort);
      child.on('exit', abort);
      child.stdin.on('error', abort);
      const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while (!settled && (newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
            if (message.id !== 1 && message.id !== 2) continue;
            if (message.error) { finish(); return; }
            if (message.id === 1) {
              send({ method: 'initialized' });
              send({ id: 2, method: 'account/rateLimits/read' });
            } else {
              finish(parseCodexAccountLimits(message.result));
            }
          } catch {
            finish();
          }
        }
      });
      send({ id: 1, method: 'initialize', params: {
        clientInfo: { name: 'personal_dashboard_usage', title: 'Personal Dashboard usage', version: '0.1.0' },
      } });
    });
  } catch {
    return unknown;
  }
}
