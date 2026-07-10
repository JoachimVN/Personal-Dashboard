interface UsageRefreshButtonProps {
  label: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}

export function UsageRefreshButton({
  label,
  refreshing,
  onRefresh,
}: Readonly<UsageRefreshButtonProps>) {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-track hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent-ai) disabled:cursor-wait disabled:opacity-60"
      onClick={() => void onRefresh()}
      disabled={refreshing}
      aria-label={`Refresh ${label} usage`}
    >
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
