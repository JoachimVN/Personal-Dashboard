export function relativeTime(iso: string): string {
  const deltaSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
  if (deltaSec < 86_400) return `${Math.floor(deltaSec / 3600)} h ago`;
  return `${Math.floor(deltaSec / 86_400)} d ago`;
}
