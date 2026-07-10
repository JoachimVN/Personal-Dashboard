import { Dashboard } from './Dashboard';

/** Fixed decorative layer the glass cards blur against — accent-tinted glow blobs on the canvas. */
function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div
        className="absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-ai) 22%, transparent), transparent)',
        }}
      />
      <div
        className="absolute top-1/3 -right-48 h-[40rem] w-[40rem] rounded-full opacity-50"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-github) 20%, transparent), transparent)',
        }}
      />
      <div
        className="absolute -bottom-48 left-1/4 h-[38rem] w-[38rem] rounded-full opacity-50"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-personal) 18%, transparent), transparent)',
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <BackgroundGlow />
      <main className="mx-auto max-w-6xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-6">
        <h1 className="mb-4 text-lg font-bold sm:mb-6">Dashboard</h1>
        <Dashboard />
      </main>
    </div>
  );
}
