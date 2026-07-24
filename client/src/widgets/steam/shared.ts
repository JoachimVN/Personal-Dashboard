export const accent = 'var(--color-accent-steam)';

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}
