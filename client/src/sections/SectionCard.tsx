import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
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

function SectionIcon({ id }: Readonly<{ id: SectionDef['id'] }>) {
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
  if (id === 'spotify') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 9.8c2.9-.8 6-.5 8.6 1M8 13c2.3-.6 4.7-.3 6.8 .9M8.6 16c1.7-.4 3.4-.2 4.9 .7" />
      </svg>
    );
  }
  if (id === 'health') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
        <path d="M12 20.4 3.7 12.1a5.1 5.1 0 0 1 7.2-7.2L12 6l1.1-1.1a5.1 5.1 0 0 1 7.2 7.2L12 20.4Z" />
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
