import type { HealthData, HealthDay } from '@personal-dashboard/shared';

/** Ignore placeholder daily rows created by a partial Shortcut run with no usable readings. */
export function hasActivityData(day: HealthDay): boolean {
  return [day.steps, day.activeEnergyKcal, day.exerciseMinutes, day.standHours]
    .some((value) => value !== undefined && value > 0);
}

/** Keep the dashboard useful overnight when the current day has only an empty placeholder row. */
export function latestActivityDay(data: HealthData): HealthDay | undefined {
  if (data.today && hasActivityData(data.today)) return data.today;
  return [...data.history].reverse().find(hasActivityData);
}
