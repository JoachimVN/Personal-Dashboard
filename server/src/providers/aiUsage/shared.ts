import { chmod, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { AiUsageToolData, UsageHistoryPoint } from '@personal-dashboard/shared';
import type { UsageHistoryStore } from '../../usageHistory.js';

const require = createRequire(import.meta.url);

/** What the snapshot readers produce; the provider fetch adds the store-managed `history`. */
export type UsageSnapshot = Omit<AiUsageToolData, 'history'>;
type LimitStatus = AiUsageToolData['fiveHourStatus'];

export function limit(usedPercent: number, resetsAt: number | string) {
  const reset =
    typeof resetsAt === 'number' ? new Date(resetsAt * 1_000) : new Date(resetsAt);
  if (!Number.isFinite(usedPercent) || Number.isNaN(reset.getTime())) return undefined;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    resetsAt: reset.toISOString(),
  };
}

export function limitStatus(hasLimit: boolean, hasQuotaReport: boolean): LimitStatus {
  if (hasLimit) return 'limited';
  return hasQuotaReport ? 'unlimited' : 'unknown';
}

export async function jsonlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return jsonlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

export function asIso(timestamp: string): string | undefined {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const WS = String.raw`\s*`;
const ESC = '\u001B';
const BEL = '\u0007';
const OSC_SEQUENCE = new RegExp(String.raw`${ESC}\][^${BEL}]*(?:${BEL}|${ESC}\\)`, 'g'); // OSC title/hyperlink sequences.
const CSI_SEQUENCE = new RegExp(String.raw`${ESC}\[[0-?]*[ -/]*[@-~]`, 'g'); // CSI cursor/style sequences.

export function stripTerminalControls(value: string): string {
  return value.replace(OSC_SEQUENCE, '').replace(CSI_SEQUENCE, '').replaceAll('\r', '');
}

/** node-pty's macOS prebuilt helper can lose its executable bit in npm installations that suppress
 * lifecycle scripts. Restoring it is local, idempotent, and required to open a PTY — both the
 * Claude and Codex interactive probes need it before spawning. */
export async function ensurePtySpawnHelper(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const packageRoot = path.resolve(path.dirname(require.resolve('node-pty')), '..');
  await chmod(path.join(packageRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755).catch(() => undefined);
}

/** A slow or hung DB write must never block returning an already-successful live read (see the
 * Postgres connectivity issues that froze both AI usage widgets for days). The Claude probe alone
 * can already take up to 35s inside a 40s provider timeout, leaving almost no room for a DB round
 * trip on top — Postgres retries on a dead connection can run well past whatever margin is left.
 * So this never sits in the fetch's critical path at all: it kicks the write off in the background
 * and returns the last known series immediately, updating it for the *next* fetch once the write
 * settles. That removes DB latency from the provider timeout equation entirely, rather than just
 * bounding it. */
export function recordHistorySafely(
  historyStore: UsageHistoryStore,
  toolId: string,
  snapshot: UsageSnapshot,
  remembered: { points: UsageHistoryPoint[] },
): UsageHistoryPoint[] {
  void historyStore
    .record(toolId, snapshot)
    .then((points) => {
      remembered.points = points;
    })
    .catch(() => {
      // Keep serving the last known-good series; a history-write failure isn't a live-data failure.
    });
  return remembered.points;
}
