import { motion } from 'motion/react';
import type { SectionDef } from './registry';
import { OVERVIEW_HREF } from '../router';
import { AccentDot, accentStyle } from './SectionCard';

/**
 * Expanded full view of one section. The header bar shares layoutIds with the overview's
 * SectionCard, so opening a section morphs the card into this header.
 */
export function SectionView({ section }: { section: SectionDef }) {
  return (
    <motion.div
      style={accentStyle(section)}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      <motion.header
        layoutId={`section-${section.id}`}
        className="glass mb-4 flex items-center gap-3 rounded-2xl p-4"
      >
        <a
          href={OVERVIEW_HREF}
          aria-label="Back to overview"
          className="-m-2 p-2 text-xl leading-none text-ink-muted hover:text-ink"
        >
          ‹
        </a>
        <AccentDot />
        <motion.h2
          layoutId={`section-title-${section.id}`}
          className="text-sm font-semibold uppercase tracking-wide text-(--accent)"
        >
          {section.title}
        </motion.h2>
      </motion.header>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
      >
        <section.Detail />
      </motion.div>
    </motion.div>
  );
}
