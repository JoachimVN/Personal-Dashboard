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
    <footer className="mt-7 flex flex-col items-center justify-between gap-2 border-t border-card-border px-1 pt-5 text-[11px] text-ink-faint sm:flex-row">
      <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(16_185_129_/_0.7)]" />All systems operational</span>
      <span>{data.hostname} · up {formatUptime(data.uptimeSeconds)} · {data.serverTime} {data.timezone}</span>
    </footer>
  );
}
