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
      .then((response) => response.ok ? response.json() as Promise<{ repos: string[] }> : Promise.reject())
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
    <form onSubmit={submit} className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Quick issue capture</h2>
        <button type="button" onClick={() => setDetail((open) => !open)} className="text-xs font-medium text-ink-muted hover:text-ink">
          {detail ? 'Less detail' : 'Add detail'}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={repo} onChange={(event) => setRepo(event.target.value)} className="rounded border border-card-border bg-canvas px-2 py-1.5 text-sm" disabled={!repos.length}>
          {repos.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Capture an issue…" maxLength={160} className="min-w-0 flex-1 rounded border border-card-border bg-canvas px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm font-semibold text-canvas disabled:opacity-50" disabled={!repo || !title.trim()}>Create</button>
      </div>
      {detail && <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Optional context…" rows={3} className="mt-2 w-full rounded border border-card-border bg-canvas px-2 py-1.5 text-sm" />}
      {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
    </form>
  );
}
