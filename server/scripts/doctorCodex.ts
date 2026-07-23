import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type Check = {
  label: string;
  detail: string;
  ok: boolean;
};

async function command(args: string[]): Promise<boolean> {
  try {
    await execFileAsync(args[0], args.slice(1), { encoding: 'utf8', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function writable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function gitDirectory(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const home = homedir();
  const expectedHost = join(home, '.local/bin/codex-code-mode-host');
  const standaloneHost = join(home, '.codex/packages/standalone/current/bin/codex-code-mode-host');
  const gitDir = await gitDirectory();
  const expectedHostAvailable = await executable(expectedHost);
  const standaloneHostAvailable = await executable(standaloneHost);
  const gitDirectoryWritable = gitDir ? await writable(gitDir) : false;
  const ghAuthenticated = await command(['gh', 'auth', 'status']);
  const checks: Check[] = [
    {
      label: 'Codex code-mode host',
      detail: expectedHostAvailable
        ? `available at ${expectedHost}`
        : standaloneHostAvailable
          ? `standalone host exists, but the expected alias is unavailable (${expectedHost})`
          : 'not available at the expected or standalone path',
      ok: expectedHostAvailable,
    },
    {
      label: 'Git metadata directory',
      detail: gitDir
        ? gitDirectoryWritable
          ? `${gitDir} appears writable`
          : `${gitDir} is not writable in this session`
        : 'could not resolve the Git metadata directory',
      ok: gitDirectoryWritable,
    },
    {
      label: 'GitHub CLI authentication',
      detail: ghAuthenticated
        ? 'available in this execution context'
        : 'unavailable or invalid in this execution context',
      ok: ghAuthenticated,
    },
  ];

  console.log('Codex workflow report');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'CHECK'}  ${check.label}: ${check.detail}`);
  }
  console.log('\nThis command never changes credentials, permissions, or Git state.');
}

await main();
