import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
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

export const sectionCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

/** Overview block for one section — the whole card is a link into the section's full view. */
export function SectionCard({ section }: { section: SectionDef }) {
  return (
    <motion.a
      href={sectionHref(section.id)}
      layoutId={`section-${section.id}`}
      variants={sectionCardVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="glass block rounded-2xl p-4"
      style={accentStyle(section)}
    >
      <header className="mb-3 flex items-center gap-2">
        <AccentDot />
        <motion.h2
          layoutId={`section-title-${section.id}`}
          className="text-sm font-semibold uppercase tracking-wide text-(--accent)"
        >
          {section.title}
        </motion.h2>
        <span aria-hidden className="ml-auto text-lg leading-none text-ink-faint">
          ›
        </span>
      </header>
      <section.Overview />
    </motion.a>
  );
}
