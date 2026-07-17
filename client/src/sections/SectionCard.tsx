import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { motion } from 'motion/react';
import type { SectionDef } from './registry';
import { sectionHref } from '../router';

export function accentStyle(section: SectionDef): CSSProperties {
  return { '--accent': `var(${section.accentVar})` } as CSSProperties;
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
      <img src="/github-invertocat-black.svg" alt="" aria-hidden className="section-icon-github h-5 w-5" />
    );
  }
  if (id === 'spotify') {
    return (
      <img src="/spotify.svg" alt="" aria-hidden className="h-5 w-5" />
    );
  }
  if (id === 'weather') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3.5" stroke="var(--accent)" />
        <path d="M9 2.5v1.4M9 14.1v1.4M2.5 9h1.4M14.1 9h1.4M4.4 4.4l1 1M12.6 12.6l1 1M13.6 4.4l-1 1M5.4 12.6l-1 1" stroke="var(--accent)" />
        <path d="M13 20.5h5.2a3.3 3.3 0 0 0 .6-6.55A4.6 4.6 0 0 0 10 12.9a3.6 3.6 0 0 0 .4 7.6H13Z" fill="var(--color-card)" />
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
  if (id === 'steam') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
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
