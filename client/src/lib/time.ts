export function relativeTime(iso: string): string {
  const deltaSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
  if (deltaSec < 86_400) return `${Math.floor(deltaSec / 3600)} h ago`;
  return `${Math.floor(deltaSec / 86_400)} d ago`;
}

/** Formats a future ISO timestamp as "in N min" / "in N h", clamped to "any moment" once past. */
export function relativeFutureTime(iso: string): string {
  const deltaSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (deltaSec <= 0) return 'any moment';
  if (deltaSec < 60) return 'in under a minute';
  if (deltaSec < 3600) return `in ${Math.ceil(deltaSec / 60)} min`;
  return `in ${Math.ceil(deltaSec / 3600)} h`;
}
