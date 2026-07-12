import type { HealthData, HealthDay } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-personal)';

function Bar({ label, value, goal, unit }: Readonly<{ label: string; value: number; goal: number; unit: string }>) {
  const pct = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
  const met = value >= goal;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink-faint">
          <span className="font-semibold text-ink">{value.toLocaleString()}</span> / {goal.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: accent, opacity: met ? 1 : 0.75 }}
        />
      </div>
    </div>
  );
}

function Stat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className="rounded-xl bg-track/25 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{label}</p>
    </div>
  );
}

function ActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
}: Readonly<{
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number;
  goals: HealthData['goals'];
}>) {
  const rings = [
    { label: 'Move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, unit: 'kcal', color: '#ff2d55', track: '#4c0717', radius: 49 },
    { label: 'Exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, unit: 'min', color: '#b8f400', track: '#173c0a', radius: 33 },
    { label: 'Stand', value: standHours, goal: goals.standHours, unit: 'hrs', color: '#00d5ee', track: '#063940', radius: 17 },
  ];

  return (
    <div className="rounded-2xl bg-track/25 p-3">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" aria-label="Daily activity rings" role="img">
          {rings.map((ring) => {
            const circumference = 2 * Math.PI * ring.radius;
            const progress = Math.min(Math.max(ring.value / ring.goal, 0), 1);
            return (
              <g key={ring.label} transform="rotate(-90 60 60)">
                <circle cx="60" cy="60" r={ring.radius} fill="none" stroke={ring.track} strokeWidth="16" />
                <circle
                  cx="60"
                  cy="60"
                  r={ring.radius}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-500"
                />
              </g>
            );
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-2">
          {rings.map((ring) => (
            <div key={ring.label} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium" style={{ color: ring.color }}>{ring.label}</span>
              <span className="tabular-nums text-ink-faint">
                <span className="font-semibold text-ink">{Math.round(ring.value).toLocaleString()}</span> / {ring.goal.toLocaleString()} {ring.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepsTrend({ history, goal }: Readonly<{ history: HealthDay[]; goal: number }>) {
  const days = history.slice(-7);
  if (days.length < 2) return null;
  const max = Math.max(goal, ...days.map((d) => d.steps ?? 0), 1);
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">Steps · last {days.length} days</p>
      <div className="flex h-14 items-end gap-1.5">
        {days.map((day) => {
          const steps = day.steps ?? 0;
          const height = (steps / max) * 100;
          const met = steps >= goal;
          const weekday = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' });
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[3px]"
                  style={{ height: `${Math.max(height, 3)}%`, background: accent, opacity: met ? 1 : 0.4 }}
                  aria-label={`${day.date}: ${steps.toLocaleString()} steps`}
                />
              </div>
              <span className="text-[9px] text-ink-faint">{weekday}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthBody({ data }: Readonly<{ data: HealthData }>) {
  const t = data.today;
  if (!t && data.history.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No health data yet. Set up the Apple Shortcut to post today’s activity — see the README.
      </p>
    );
  }

  const stats: { value: string; label: string }[] = [];
  if (t?.sleepHours != null) stats.push({ value: `${t.sleepHours.toFixed(1)}h`, label: 'sleep' });
  if (t?.heartRate != null) stats.push({ value: `${Math.round(t.heartRate)}`, label: 'avg bpm' });
  if (t?.restingHeartRate != null) stats.push({ value: `${Math.round(t.restingHeartRate)}`, label: 'rest bpm' });
  if (t?.daylightMinutes != null) stats.push({ value: `${Math.round(t.daylightMinutes)}m`, label: 'daylight' });
  if (t?.bloodOxygenPercent != null) stats.push({ value: `${Math.round(t.bloodOxygenPercent)}%`, label: 'avg oxygen' });
  if (t?.respiratoryRate != null) stats.push({ value: `${t.respiratoryRate.toFixed(1)}`, label: 'avg resp / min' });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Bar label="Steps" value={t?.steps ?? 0} goal={data.goals.steps} unit="" />
      </div>

      <ActivityRings
        activeEnergyKcal={t?.activeEnergyKcal ?? 0}
        exerciseMinutes={t?.exerciseMinutes ?? 0}
        standHours={t?.standHours ?? 0}
        goals={data.goals}
      />

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <Stat key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      )}

      {t?.workouts && t.workouts.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {t.workouts.map((w) => (
            <li
              key={`${w.type}-${w.durationMin ?? ''}-${w.distanceKm ?? ''}-${w.energyKcal ?? ''}`}
              className="flex items-baseline gap-2 rounded-xl bg-track/25 px-3 py-2"
            >
              <span className="font-medium">{w.type}</span>
              <span className="ml-auto text-xs text-ink-faint">
                {[
                  w.durationMin != null ? `${Math.round(w.durationMin)} min` : null,
                  w.distanceKm != null ? `${w.distanceKm.toFixed(1)} km` : null,
                  w.energyKcal != null ? `${Math.round(w.energyKcal)} kcal` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <StepsTrend history={data.history} goal={data.goals.steps} />

      {data.updatedAt && (
        <p className="text-[11px] text-ink-faint">Synced {relativeTime(data.updatedAt)}</p>
      )}
    </div>
  );
}

export function HealthWidget() {
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <WidgetCard title="Health" envelope={envelope} offline={offline}>
      {(data) => <HealthBody data={data} />}
    </WidgetCard>
  );
}
