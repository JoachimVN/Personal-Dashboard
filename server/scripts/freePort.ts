// Runs automatically before `npm run dev` (predev). Kills anything already bound to the
// dashboard's port so a leftover process from a previous session can never silently keep
// serving stale env/code while a new `npm run dev` looks like it started fine.
import 'dotenv/config';
import { execSync } from 'node:child_process';

const port = Number(process.env.PORT ?? 4821);

function pidsOnPort(port: number): number[] {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out.split('\n').map((line) => Number(line.trim())).filter(Boolean);
  } catch {
    return [];
  }
}

function commandFor(pid: number): string {
  try {
    return execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
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
