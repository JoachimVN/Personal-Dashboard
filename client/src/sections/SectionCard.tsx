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

function SectionIcon({ id }: { id: SectionDef['id'] }) {
  if (id === 'ai') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3.25v17.5M3.25 12h17.5M5.8 5.8l12.4 12.4M18.2 5.8 5.8 18.2" />
        <circle cx="12" cy="12" r="4.25" fill="var(--accent)" stroke="none" />
      </svg>
    );
  }
  if (id === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="8" cy="19" r="2" />
        <path d="M6 7v4a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V9M8 17v-2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 17l9-10" /><path d="M19 13v6H5V5h9" />
    </svg>
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
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={`dashboard-section-card dashboard-section-card--${section.id} glass group relative z-10 block overflow-hidden rounded-[1.75rem] p-5 sm:p-6`}
      style={accentStyle(section)}
    >
      <div aria-hidden className="section-card-aura" />
      <header className="relative mb-5 flex items-center gap-3">
        <span className="section-icon grid h-10 w-10 place-items-center rounded-2xl text-(--accent)">
          <SectionIcon id={section.id} />
        </span>
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            {section.label}
          </span>
          <motion.h2
            layoutId={`section-title-${section.id}`}
            className="text-[1.05rem] font-semibold tracking-[-0.02em] text-ink"
          >
            {section.title}
          </motion.h2>
        </div>
        <span aria-hidden className="section-arrow ml-auto grid h-9 w-9 place-items-center rounded-full text-lg text-ink-muted">
          ↗
        </span>
      </header>
      <div className="relative section-card-content">
        <section.Overview />
      </div>
      <p className="relative mt-5 border-t border-card-border pt-4 text-xs text-ink-faint">
        {section.description}
      </p>
    </motion.a>
  );
}
