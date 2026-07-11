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
    <section className="action-card glass relative h-full overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
      <div aria-hidden className="action-card-glow bg-(--color-accent-ai)" />
      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl border border-card-border bg-track/50 text-(--color-accent-ai)">
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>
        </span>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Launch</p>
          <h2 className="text-base font-semibold tracking-[-0.025em]">Code session</h2>
        </div>
      </div>
      <p className="relative mt-5 text-xs leading-5 text-ink-muted">Open VS Code with Codex and Claude Code ready to work side by side.</p>
      <div className="relative mt-4 space-y-2">
        <select value={repo} aria-label="Project" onChange={(event) => setRepo(event.target.value)} className="premium-field w-full" disabled={!projects.length}>
          {projects.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void launch('session')} disabled={!repo} className="premium-primary-button">Start session <span aria-hidden>↗</span></button>
          <button type="button" onClick={() => void launch('github-desktop')} disabled={!repo} className="premium-secondary-button">GitHub Desktop</button>
        </div>
      </div>
      {message && <p aria-live="polite" className="relative mt-3 text-[11px] text-ink-muted">{message}</p>}
    </section>
  );
}
