import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT ?? 4821);
const uid = process.getuid?.() ?? 501;
const serviceLabel = 'local.personal-dashboard';
const serviceRoot =
  process.env.PERSONAL_DASHBOARD_SERVICE_ROOT ?? `${homedir()}/.local/share/personal-dashboard/repo`;
const runtimeEnvPath =
  process.env.PERSONAL_DASHBOARD_RUNTIME_ENV_PATH ??
  `${homedir()}/.local/share/personal-dashboard/state/.env`;

type Check = {
  label: string;
  detail: string;
  ok: boolean;
};

async function command(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(args[0], args.slice(1), {
      encoding: 'utf8',
      timeout: 5_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function gitHead(path: string): Promise<string | undefined> {
  const result = await command(['git', '-C', path, 'rev-parse', '--short', 'HEAD']);
  return result.ok ? result.output : undefined;
}

async function readDatabaseUrlPresence(): Promise<boolean | undefined> {
  try {
    const env = await readFile(runtimeEnvPath, 'utf8');
    return /^DATABASE_URL=.+$/m.test(env);
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const checks: Check[] = [];
  const listener = await command(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
  checks.push({
    label: `Port ${port}`,
    detail: listener.ok ? 'a process is listening' : 'no listener found',
    ok: listener.ok,
  });

  const launchAgent = await command(['launchctl', 'print', `gui/${uid}/${serviceLabel}`]);
  const pointsAtServiceRoot = launchAgent.output.includes(serviceRoot);
  checks.push({
    label: 'LaunchAgent',
    detail: launchAgent.ok
      ? pointsAtServiceRoot
        ? `registered and points at ${serviceRoot}`
        : 'registered, but its working directory needs inspection'
      : 'not registered or unavailable',
    ok: launchAgent.ok && pointsAtServiceRoot,
  });

  const serviceExists = await exists(serviceRoot);
  const serviceHead = serviceExists ? await gitHead(serviceRoot) : undefined;
  checks.push({
    label: 'Serving checkout',
    detail: serviceHead ? `${serviceRoot} at ${serviceHead}` : 'not available or not a Git checkout',
    ok: Boolean(serviceHead),
  });

  try {
    const build = await stat(`${serviceRoot}/client/dist/index.html`);
    checks.push({
      label: 'Serving client build',
      detail: `index.html modified ${build.mtime.toISOString()}`,
      ok: true,
    });
  } catch {
    checks.push({ label: 'Serving client build', detail: 'client/dist/index.html is missing', ok: false });
  }

  const databaseUrlPresent = await readDatabaseUrlPresence();
  checks.push({
    label: 'Runtime database configuration',
    detail: databaseUrlPresent === undefined
      ? 'runtime env file could not be read'
      : databaseUrlPresent
        ? 'DATABASE_URL is present (value withheld)'
        : 'DATABASE_URL is missing or empty',
    ok: databaseUrlPresent === true,
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  let healthDetail = 'request failed';
  let healthOk = false;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) });
    healthOk = response.ok;
    healthDetail = `${response.status} ${response.statusText}`;
  } catch {
    // Sandboxed environments can block localhost networking; retain the other evidence.
  }
  checks.push({ label: 'Health endpoint', detail: healthDetail, ok: healthOk });

  console.log('Personal Dashboard live-runtime report');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'CHECK'}  ${check.label}: ${check.detail}`);
  }

  if (serviceHead && !healthOk) {
    console.log('\nNext: inspect the LaunchAgent startup log before changing provider or UI code.');
  } else if (serviceHead && healthOk) {
    console.log('\nNext: compare this serving revision with the expected change. If it matches, check PWA/service-worker cache.');
  }
}

await main();
