import type { CSSProperties } from 'react';
import type { SectionDef } from './registry';
import { sectionHref } from '../router';

export function accentStyle(section: SectionDef): CSSProperties {
  return { '--accent': `var(${section.accentVar})` } as CSSProperties;
}

export function AccentDot() {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full bg-(--accent)"
      style={{ boxShadow: '0 0 12px 2px color-mix(in oklab, var(--accent) 45%, transparent)' }}
    />
  );
}

/** Overview block for one section — the whole card is a link into the section's full view. */
export function SectionCard({ section }: { section: SectionDef }) {
  return (
    <a
      href={sectionHref(section.id)}
      className="glass block rounded-2xl p-4 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
      style={accentStyle(section)}
    >
      <header className="mb-3 flex items-center gap-2">
        <AccentDot />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-(--accent)">
          {section.title}
        </h2>
        <span aria-hidden className="ml-auto text-lg leading-none text-ink-faint">
          ›
        </span>
      </header>
      <section.Overview />
    </a>
  );
}
