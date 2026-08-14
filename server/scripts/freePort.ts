// Runs automatically before `npm run dev` (predev). Kills anything already bound to the
// dashboard's port so a leftover process from a previous session can never silently keep
// serving stale env/code while a new `npm run dev` looks like it started fine.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';

const port = Number(process.env.PORT ?? 4821);
const isWindows = process.platform === 'win32';

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function pidsOnPort(port: number): number[] {
  if (isWindows) {
    // netstat is always present; `lsof` is not. Lines look like:
    //   TCP    127.0.0.1:4822    0.0.0.0:0    LISTENING    12345
    const rows = run('netstat', ['-ano', '-p', 'tcp']).split('\n');
    const pids = rows
      .filter((line) => /\s+LISTENING\s+/.test(line))
      .filter((line) => new RegExp(`[:.]${port}\\s`).test(line))
      .map((line) => Number(line.trim().split(/\s+/).at(-1)))
      .filter(Boolean);
    return [...new Set(pids)];
  }
  const out = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  return out.split('\n').map((line) => Number(line.trim())).filter(Boolean);
}

function commandFor(pid: number): string {
  if (isWindows) {
    return run('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ]).trim();
  }
  return run('ps', ['-o', 'command=', '-p', String(pid)]).trim();
}

for (const pid of pidsOnPort(port)) {
  const command = commandFor(pid);
  if (!command.includes('tsx')) {
    console.error(
      `Port ${port} is held by pid ${pid} (${command || 'unknown command'}), which doesn't ` +
        `look like this project's dev server. Not killing it automatically — free the port yourself.`,
    );
    process.exit(1);
  }
  console.log(`Killing stale dev server on port ${port} (pid ${pid})`);
  process.kill(pid, 'SIGTERM');
}
