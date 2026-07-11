import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';

interface DetailIntroProps {
  eyebrow: string;
  title: ReactNode;
  description: string;
  accent: string;
  children?: ReactNode;
}

/** Editorial opening block shared by the three section detail pages. */
export function DetailIntro({ eyebrow, title, description, accent, children }: DetailIntroProps) {
  return (
    <motion.section
      className="detail-intro relative mb-5 overflow-hidden rounded-[2rem] p-6 sm:mb-6 sm:p-8 lg:p-10"
      style={{ '--detail-accent': accent } as CSSProperties}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div aria-hidden className="detail-intro-orb" />
      <div aria-hidden className="detail-intro-grid" />
      <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-(--detail-accent)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--detail-accent) shadow-[0_0_10px_var(--detail-accent)]" />
            {eyebrow}
          </div>
          <h1 className="detail-intro-title max-w-3xl text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[0.94] tracking-[-0.065em]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">
            {description}
          </p>
        </div>
        {children && <div className="relative min-w-0 lg:min-w-72">{children}</div>}
      </div>
    </motion.section>
  );
}

export function DetailSectionHeading({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mb-4 mt-8 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{label}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">{title}</h2>
      </div>
      {detail && <p className="max-w-md text-xs leading-5 text-ink-faint sm:text-right">{detail}</p>}
    </div>
  );
}
