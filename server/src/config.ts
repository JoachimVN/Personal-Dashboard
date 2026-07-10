import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const configSchema = z.object({
  github: z
    .object({
      pinnedRepos: z.array(z.string()).default([]),
    })
    .default({ pinnedRepos: [] }),
  calendar: z
    .object({
      /** Calendar display names to show; empty = all event calendars. */
      allowlist: z.array(z.string()).default([]),
    })
    .default({ allowlist: [] }),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Non-secret settings (pinned repos, feeds, …) from server/config.json. */
export function loadConfig(): AppConfig {
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../config.json',
  );
  try {
    return configSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('⚠️  Could not read config.json — using defaults.', err);
    }
    return configSchema.parse({});
  }
}
