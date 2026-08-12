export function NewsMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.75 4.75h11.5a2 2 0 0 1 2 2v10.75a1.75 1.75 0 0 1-1.75 1.75H6.5a1.75 1.75 0 0 1-1.75-1.75Z" />
      <path d="M18.25 8.5h1a1 1 0 0 1 1 1v8a2.25 2.25 0 0 1-2.25 2.25" />
      <path d="M7.5 8.25h6M7.5 11.25h6M7.5 14.25h3.5" />
    </svg>
  );
}
