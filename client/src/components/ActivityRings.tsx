import { useId } from 'react';
import type { HealthData } from '@personal-dashboard/shared';

interface ActivityRingsProps {
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number;
  goals: HealthData['goals'];
}

export function ActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
}: Readonly<ActivityRingsProps>) {
  const gradientPrefix = useId().replace(/:/g, '');
  const rings = [
    { id: 'move', label: 'Move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, unit: 'kcal', start: '#d91f3b', end: '#ff5a8b', track: 'light-dark(#f6c7d2, #4c0717)', radius: 48 },
    { id: 'exercise', label: 'Exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, unit: 'min', start: '#70cc00', end: '#d4ff00', track: 'light-dark(#d8efc4, #173c0a)', radius: 33 },
    { id: 'stand', label: 'Stand', value: standHours, goal: goals.standHours, unit: 'hrs', start: '#00b7cb', end: '#48def4', track: 'light-dark(#c3e9ee, #063940)', radius: 18 },
  ];

  return (
    <div className="rounded-2xl bg-track/25 p-3">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" aria-label="Daily activity rings" role="img">
          <defs>
            {rings.map((ring) => (
              <linearGradient key={ring.id} id={`${gradientPrefix}-${ring.id}-ring-gradient`} x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={ring.start} />
                <stop offset="1" stopColor={ring.end} />
              </linearGradient>
            ))}
          </defs>
          {rings.map((ring) => {
            const circumference = 2 * Math.PI * ring.radius;
            const progress = Math.min(Math.max(ring.value / ring.goal, 0), 1);
            return (
              <g key={ring.id} transform="rotate(-90 60 60)">
                <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth="14" style={{ stroke: 'light-dark(transparent, #090c10)' }} />
                <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth="12" style={{ stroke: ring.track }} />
                <circle
                  cx="60"
                  cy="60"
                  r={ring.radius}
                  fill="none"
                  stroke={`url(#${gradientPrefix}-${ring.id}-ring-gradient)`}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-500"
                  style={{ filter: 'drop-shadow(1px 2px 1.5px light-dark(rgb(15 23 42 / 0.22), rgb(0 0 0 / 0.42)))' }}
                />
              </g>
            );
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-2">
          {rings.map((ring) => (
            <div key={ring.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium" style={{ color: ring.end }}>{ring.label}</span>
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
