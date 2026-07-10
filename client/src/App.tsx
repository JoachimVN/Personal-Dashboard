import { Dashboard } from './Dashboard';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <main className="mx-auto max-w-6xl p-4 pb-[env(safe-area-inset-bottom)] sm:p-6">
        <h1 className="mb-4 text-lg font-bold sm:mb-6">Dashboard</h1>
        <Dashboard />
      </main>
    </div>
  );
}
