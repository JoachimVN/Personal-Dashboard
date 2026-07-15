import type { HealthData } from '@personal-dashboard/shared';
import { ActivityRings } from '../../components/ActivityRings';
import { WidgetBody } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';
import { latestActivityDay } from '../../lib/health';

export function HealthOverview() {
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = latestActivityDay(data);
        if (!today) return <p className="text-sm text-ink-faint">Health data is waiting for its first sync.</p>;
        const isToday = data.today === today;
        const steps = today.steps ?? 0;
        const stepProgress = Math.min(100, (steps / data.goals.steps) * 100);
        const signals = [
          today.heartRate != null && { label: 'Average heart rate', value: `${Math.round(today.heartRate)} bpm`, tone: 'text-rose-300' },
          today.bloodOxygenPercent != null && { label: 'Blood oxygen', value: `${Math.round(today.bloodOxygenPercent)}%`, tone: 'text-cyan-300' },
        ].filter((signal): signal is { label: string; value: string; tone: string } => Boolean(signal));
        return (
          <div className="grid gap-3 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(20rem,1.25fr)]">
            <div className="rounded-2xl bg-track/25 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">{isToday ? 'Today’s steps' : 'Last synced steps'}</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] tabular-nums">{steps.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-ink-muted">of {data.goals.steps.toLocaleString()} step goal</p>
                </div>
                <span className="rounded-full bg-(--color-accent-personal)/12 px-2.5 py-1 text-xs font-semibold tabular-nums text-(--color-accent-personal)">{Math.round(stepProgress)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-(--color-accent-personal) transition-[width] duration-500" style={{ width: `${stepProgress}%` }} />
              </div>
              {signals.length > 0 && (
                <div className={`mt-4 grid gap-2 border-t border-card-border pt-3 ${signals.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {signals.map((signal) => (
                    <div key={signal.label} className="min-w-0">
                      <p className="truncate text-[10px] uppercase tracking-[0.1em] text-ink-faint">{signal.label}</p>
                      <p className={`mt-1 text-sm font-semibold tabular-nums ${signal.tone}`}>{signal.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <ActivityRings
              activeEnergyKcal={today.activeEnergyKcal ?? 0}
              exerciseMinutes={today.exerciseMinutes ?? 0}
              standHours={today.standHours ?? 0}
              goals={data.goals}
            />
          </div>
        );
      }}
    </WidgetBody>
  );
}
