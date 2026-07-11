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
      className="col-start-1 row-start-1"
      style={accentStyle(section)}
    >
      <motion.header
        layoutId={`section-${section.id}`}
        className="detail-header glass relative z-10 mb-6 flex items-center gap-3 rounded-[1.5rem] p-3 pr-4 sm:mb-8"
      >
        <a
          href={OVERVIEW_HREF}
          aria-label="Back to overview"
          className="detail-back grid h-10 w-10 place-items-center rounded-2xl text-xl leading-none text-ink-muted transition hover:text-ink"
        >
          ←
        </a>
        <span className="h-7 w-px bg-card-border" />
        <div>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{section.label}</span>
          <motion.p layoutId={`section-title-${section.id}`} className="text-sm font-semibold tracking-tight text-ink">
            {section.title}
          </motion.p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-faint">
          <AccentDot />
          <span>Live</span>
        </div>
      </motion.header>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
      >
        <section.Detail />
      </motion.div>
    </motion.div>
  );
}
