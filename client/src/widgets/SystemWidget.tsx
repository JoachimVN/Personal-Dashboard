import type { SystemData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function SystemWidget() {
  const { envelope, offline } = useWidget<SystemData>('system');

  return (
    <WidgetCard title="Server" envelope={envelope} offline={offline}>
      {(data) => (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
          <dt className="text-slate-400 dark:text-slate-500">Host</dt>
          <dd>{data.hostname}</dd>
          <dt className="text-slate-400 dark:text-slate-500">Platform</dt>
          <dd>
            {data.platform} · {data.nodeVersion}
          </dd>
          <dt className="text-slate-400 dark:text-slate-500">Uptime</dt>
          <dd>{formatUptime(data.uptimeSeconds)}</dd>
          <dt className="text-slate-400 dark:text-slate-500">Time</dt>
          <dd>
            {data.serverTime}{' '}
            <span className="text-slate-400 dark:text-slate-500">({data.timezone})</span>
          </dd>
        </dl>
      )}
    </WidgetCard>
  );
}
