import { useEffect, useState, type FormEvent } from 'react';

export function IssueCapture() {
  const [repos, setRepos] = useState<string[]>([]);
  const [repo, setRepo] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [detail, setDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/github/repos')
      .then((response) => response.ok ? response.json() as Promise<{ repos: string[] }> : Promise.reject(new Error('Could not load repositories.')))
      .then(({ repos: next }) => { setRepos(next); setRepo(next[0] ?? ''); })
      .catch(() => setMessage('Could not load repositories.'));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!repo || !title.trim()) return;
    setMessage('Creating…');
    const response = await fetch('/api/github/issues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, title, body }),
    });
    const result = await response.json() as { number?: number; url?: string; error?: string };
    if (response.ok && result.url && result.number) {
      setTitle(''); setBody(''); setDetail(false);
      setMessage(`Created #${result.number}`);
    } else {
      setMessage(result.error === 'github-write-not-authorized' ? 'Token needs Issues: write.' : 'Could not create issue.');
    }
  }

  return (
    <form onSubmit={submit} className="action-card glass relative h-full overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
      <div aria-hidden className="action-card-glow bg-(--color-accent-github)" />
      <div className="relative mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-card-border bg-track/50 text-(--color-accent-github)">
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Capture</p>
            <h2 className="text-base font-semibold tracking-[-0.025em]">Create an issue</h2>
          </div>
        </div>
        <button type="button" onClick={() => setDetail((open) => !open)} className="rounded-full border border-card-border px-3 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-track/60 hover:text-ink">
          {detail ? 'Less detail' : 'Add detail'}
        </button>
      </div>
      <p className="relative mb-4 text-xs leading-5 text-ink-muted">Get the thought out of your head and into the right repository.</p>
      <div className="relative flex flex-col gap-2 sm:flex-row">
        <select value={repo} aria-label="Repository" onChange={(event) => setRepo(event.target.value)} className="premium-field sm:max-w-48" disabled={!repos.length}>
          {repos.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs attention?" maxLength={160} className="premium-field min-w-0 flex-1" />
        <button type="submit" className="premium-primary-button" disabled={!repo || !title.trim()}>Create <span aria-hidden>↗</span></button>
      </div>
      {detail && <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add context, acceptance criteria or useful links…" rows={3} className="premium-field relative mt-2 w-full resize-none" />}
      <div className="relative mt-3 flex items-center justify-between text-[10px] text-ink-faint">
        <span>Press Enter to create</span>
        {message && <span aria-live="polite" className="text-ink-muted">{message}</span>}
      </div>
    </form>
  );
}
