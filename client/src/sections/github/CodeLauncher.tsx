import { useEffect, useState } from 'react';

export function CodeLauncher() {
  const [projects, setProjects] = useState<string[]>([]);
  const [repo, setRepo] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/code/projects').then((response) => response.json() as Promise<{ projects: { repo: string }[] }>).then(({ projects }) => {
      const names = projects.map((project) => project.repo); setProjects(names); setRepo(names[0] ?? '');
    }).catch(() => setMessage('Configure a project path first.'));
  }, []);

  async function launch(action: 'session' | 'github-desktop') {
    if (!repo) return;
    setMessage('Starting…');
    const response = await fetch('/api/code/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, action }) });
    setMessage(response.ok ? (action === 'session' ? 'VS Code session started.' : 'GitHub Desktop opened.') : 'Could not start this action.');
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <h2 className="text-sm font-semibold">Code session</h2>
      <p className="mt-1 text-xs text-ink-muted">Open a repo in VS Code with Codex and Claude Code terminal tasks.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={repo} onChange={(event) => setRepo(event.target.value)} className="rounded border border-line bg-canvas px-2 py-1.5 text-sm" disabled={!projects.length}>
          {projects.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <button type="button" onClick={() => void launch('session')} disabled={!repo} className="rounded bg-ink px-3 py-1.5 text-sm font-semibold text-canvas disabled:opacity-50">Start session</button>
        <button type="button" onClick={() => void launch('github-desktop')} disabled={!repo} className="rounded border border-line px-3 py-1.5 text-sm font-semibold">GitHub Desktop</button>
      </div>
      {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
    </section>
  );
}
