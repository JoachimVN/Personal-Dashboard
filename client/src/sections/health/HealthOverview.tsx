import type { HealthData } from '@personal-dashboard/shared';
import { WidgetBody } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';

export function HealthOverview() {
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = data.today;
        if (!today) return <p className="text-sm text-ink-faint">Health data is waiting for its first sync.</p>;
        return (
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold tracking-[-0.05em] tabular-nums">{(today.steps ?? 0).toLocaleString()}</p>
                <p className="text-xs text-ink-faint">steps today</p>
              </div>
              {today.heartRate != null && (
                <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-right">
                  <p className="text-lg font-semibold tabular-nums text-rose-300">♥ {Math.round(today.heartRate)}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">avg bpm</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-card-border pt-3 text-xs">
              <div><p className="text-ink-faint">Move</p><p className="mt-0.5 font-semibold tabular-nums">{Math.round(today.activeEnergyKcal ?? 0)} kcal</p></div>
              <div><p className="text-ink-faint">Exercise</p><p className="mt-0.5 font-semibold tabular-nums">{Math.round(today.exerciseMinutes ?? 0)} min</p></div>
              <div><p className="text-ink-faint">Stand</p><p className="mt-0.5 font-semibold tabular-nums">{Math.round(today.standHours ?? 0)} hrs</p></div>
            </div>
          </div>
        );
      }}
    </WidgetBody>
  );
}
