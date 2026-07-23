import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const requestedPaths = process.argv.slice(2).map((path) => path.replace(/^\.\//, '').replace(/\/$/, ''));

function matchesRequestedPath(file: string): boolean {
  return requestedPaths.some((path) => file === path || file.startsWith(`${path}/`));
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout.trim();
}

function warningLines(diff: string): string[] {
  const addedLines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const patterns: Array<[string, RegExp]> = [
    ['possible secret assignment', /\b(api[_-]?key|token|secret|password|cookie)\b\s*[:=]/i],
    ['raw request/body logging', /console\.(log|debug|info).*\b(body|payload|request)\b/i],
    ['enabled debug flag', /\b[A-Z][A-Z0-9_]*DEBUG[A-Z0-9_]*\s*=\s*true\b/],
  ];

  const patternWarnings = addedLines.flatMap((line) => patterns
    .filter(([, pattern]) => pattern.test(line))
    .map(([label]) => `${label}: ${line.slice(1).trim().slice(0, 120)}`));
  const phoneWarnings = addedLines
    .filter((line) => !/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(line))
    .filter((line) => /\+?\d[\d .()-]{7,}\d/.test(line))
    .map((line) => `possible phone number: ${line.slice(1).trim().slice(0, 120)}`);

  return [...patternWarnings, ...phoneWarnings];
}

if (requestedPaths.length === 0) {
  console.error('Usage: npm run precommit:scope -- <repo-relative-path> [more paths]');
  process.exit(1);
}

try {
  const staged = (await git(['diff', '--cached', '--name-only'])).split('\n').filter(Boolean);
  if (staged.length === 0) {
    throw new Error('Nothing is staged. Stage explicit paths first; this command never stages files.');
  }

  const unexpected = staged.filter((file) => !matchesRequestedPath(file));
  if (unexpected.length > 0) {
    const unexpectedList = unexpected.map((file) => `  - ${file}`).join('\n');
    throw new Error(`Unexpected staged files:\n${unexpectedList}`);
  }

  await git(['diff', '--cached', '--check']);
  const stagedDiff = await git(['diff', '--cached', '--unified=0']);
  const warnings = warningLines(stagedDiff);

  console.log('PASS  Staged scope matches requested paths:');
  for (const file of staged) {
    console.log(`  - ${file}`);
  }
  console.log('PASS  git diff --cached --check');
  if (warnings.length > 0) {
    console.log('\nREVIEW  Potential privacy or release-risk additions:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log('\nReady for a local commit after relevant validation passes.');
} catch (error) {
  console.error(`BLOCKED  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
