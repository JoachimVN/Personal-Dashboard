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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-ink">
          <dt className="text-ink-faint">Host</dt>
          <dd>{data.hostname}</dd>
          <dt className="text-ink-faint">Platform</dt>
          <dd>
            {data.platform} · {data.nodeVersion}
          </dd>
          <dt className="text-ink-faint">Uptime</dt>
          <dd>{formatUptime(data.uptimeSeconds)}</dd>
          <dt className="text-ink-faint">Time</dt>
          <dd>
            {data.serverTime}{' '}
            <span className="text-ink-faint">({data.timezone})</span>
          </dd>
        </dl>
      )}
    </WidgetCard>
  );
}
