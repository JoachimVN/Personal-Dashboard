import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { AppConfig } from './config.js';

const actionSchema = z.object({ repo: z.string(), action: z.enum(['session', 'github-desktop']) });
type Project = AppConfig['code']['projects'][number];

export function availableProjects(config: AppConfig, platform = process.platform) {
  const key = platform === 'win32' ? 'win32' : 'darwin';
  return config.code.projects.filter((project) => Boolean(project.paths[key])).map((project) => ({ repo: project.repo }));
}

export async function launchCodeAction(input: unknown, config: AppConfig, platform = process.platform) {
  const { repo, action } = actionSchema.parse(input);
  const key = platform === 'win32' ? 'win32' : 'darwin';
  const project = config.code.projects.find((item) => item.repo === repo);
  const projectPath = project?.paths[key];
  if (!projectPath) throw new Error('project-not-configured');
  if (action === 'github-desktop') return launch(platform === 'win32' ? 'cmd' : 'open', platform === 'win32' ? ['/c', 'start', '', 'github-desktop:'] : ['-a', 'GitHub Desktop']);

  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/workspaces');
  mkdirSync(directory, { recursive: true });
  const workspace = path.join(directory, `${repo.replaceAll('/', '--')}.code-workspace`);
  writeFileSync(workspace, `${JSON.stringify({
    folders: [{ path: projectPath }],
    tasks: { version: '2.0.0', tasks: ['codex', 'claude'].map((command) => ({ label: command === 'codex' ? 'Codex' : 'Claude Code', type: 'shell', command, options: { cwd: projectPath }, runOptions: { runOn: 'folderOpen' }, presentation: { reveal: 'always', panel: 'dedicated' }, problemMatcher: [] })) },
  }, null, 2)}\n`, { mode: 0o600 });
  return launch('code', [workspace]);
}

function launch(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export function codeActionError(error: unknown): string {
  if (error instanceof z.ZodError) return 'invalid-code-action';
  if (error instanceof Error && error.message === 'project-not-configured') return error.message;
  return 'code-launch-failed';
}
