/** Same glyph as sections/registry.tsx's SectionIcon 'personal' case — extracted here so the
 * command-center's calendar tile fallback can reuse the exact icon instead of a plain dot. */
export function CalendarMark({ className, accentColor = 'currentColor' }: Readonly<{ className?: string; accentColor?: string }>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.25" y="5" width="17.5" height="15.5" rx="3" />
      <path d="M8 3v3.4M16 3v3.4M3.25 10h17.5" />
      <rect x="13.5" y="13" width="4" height="4" rx="1" fill={accentColor} stroke="none" />
    </svg>
  );
}
