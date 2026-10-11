import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClaudeUsageProvider } from './claude.js';
import type { UsageHistoryStore } from '../../usageHistory.js';
vi.mock('node-pty', () => ({ spawn: () => { throw new Error('probe unavailable'); } }));
afterEach(() => vi.unstubAllEnvs());

describe('Claude refresh', () => {
  it('ignores quota examples in tool output when the live probe fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'claude-fixture-test-'));
    try {
      vi.stubEnv('CLAUDE_CONFIG_DIR', directory);
      await mkdir(path.join(directory, 'projects'));
      await writeFile(path.join(directory, 'projects', 'coding-session.jsonl'), JSON.stringify({
        type: 'user', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_result',
          content: 'Current session\n25% used\nResets 2:29am\nCurrent week (all models)\n77% used\nResets Jul 25 at 11:59pm',
        }] },
      }));
      const previous = { available: true, asOf: new Date(Date.now() - 60_000).toISOString(),
        fiveHourStatus: 'limited' as const, weeklyStatus: 'limited' as const,
        fiveHour: { usedPercent: 66, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        weekly: { usedPercent: 30, resetsAt: new Date(Date.now() + 86_400_000).toISOString() },
      };
      const history = { getSnapshot: vi.fn().mockResolvedValue(previous), record: vi.fn().mockResolvedValue([]) } as unknown as UsageHistoryStore;
      const result = await createClaudeUsageProvider(900_000, history).fetch(new AbortController().signal, true);
      expect(result).toMatchObject(previous);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
