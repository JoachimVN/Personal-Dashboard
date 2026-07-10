import type { SystemData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Unobtrusive one-line server status; renders nothing until data is available. */
export function SystemFooter() {
  const { envelope } = useWidget<SystemData>('system');
  const data = envelope?.data;
  if (!data) return null;

  return (
    <p className="mt-6 text-center text-xs text-ink-faint">
      {data.hostname} · {data.platform} {data.nodeVersion} · up {formatUptime(data.uptimeSeconds)} ·{' '}
      {data.serverTime} ({data.timezone})
    </p>
  );
}
