export function relativeTime(iso: string): string {
  const deltaSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
  if (deltaSec < 86_400) return `${Math.floor(deltaSec / 3600)} h ago`;
  return `${Math.floor(deltaSec / 86_400)} d ago`;
}

/** Weekday + day + month, plus year if the date isn't in the current year — otherwise a distant
 *  event (e.g. next year's birthday) reads identically to one happening this week. */
export function formatEventDate(date: string, weekday: 'long' | 'short'): string {
  const parsed = new Date(`${date}T12:00:00`);
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString('en-GB', {
    weekday,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
