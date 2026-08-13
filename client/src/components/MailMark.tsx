export function MailMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.75" y="5.5" width="18.5" height="13" rx="2.5" />
      <path d="m3.5 7 8.1 6.2a1 1 0 0 0 1.2 0L20.9 7" />
    </svg>
  );
}
