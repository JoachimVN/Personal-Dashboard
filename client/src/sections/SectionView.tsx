import type { SectionDef } from './registry';
import { OVERVIEW_HREF } from '../router';
import { AccentDot, accentStyle } from './SectionCard';

/** Expanded full view of one section: hero header bar + the section's detail content. */
export function SectionView({ section }: { section: SectionDef }) {
  return (
    <div style={accentStyle(section)}>
      <header className="glass mb-4 flex items-center gap-3 rounded-2xl p-4">
        <a
          href={OVERVIEW_HREF}
          aria-label="Back to overview"
          className="-m-2 p-2 text-xl leading-none text-ink-muted hover:text-ink"
        >
          ‹
        </a>
        <AccentDot />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-(--accent)">
          {section.title}
        </h2>
      </header>
      <section.Detail />
    </div>
  );
}
