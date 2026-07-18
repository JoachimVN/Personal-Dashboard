import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { motion } from 'motion/react';
import { SectionIcon, type SectionDef } from './registry';
import { sectionHref } from '../router';

export function accentStyle(section: SectionDef): CSSProperties {
  return { '--accent': `var(${section.accentVar})` } as CSSProperties;
}

export const sectionCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function interactiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="button"]'));
}

function openSection(section: SectionDef): void {
  window.location.hash = sectionHref(section.id).slice(1);
}

/** Overview block for one section — the whole card is a link into the section's full view. */
export function SectionCard({ section }: Readonly<{ section: SectionDef }>) {
  return (
    <motion.div
      role="link"
      tabIndex={0}
      aria-label={`Open ${section.title}`}
      onClick={(event: MouseEvent<HTMLElement>) => {
        if (!interactiveTarget(event.target)) openSection(section);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!interactiveTarget(event.target) && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openSection(section);
        }
      }}
      layoutId={`section-${section.id}`}
      variants={sectionCardVariants}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={`dashboard-section-card dashboard-section-card--${section.id} glass group relative z-10 block cursor-pointer overflow-hidden rounded-[1.75rem] p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--accent) sm:p-6`}
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
    </motion.div>
  );
}
