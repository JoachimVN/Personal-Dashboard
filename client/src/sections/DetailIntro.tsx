import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';

interface DetailIntroProps {
  title: ReactNode;
  description: string;
  accent: string;
  children?: ReactNode;
}

/** Editorial opening block shared by the three section detail pages. */
export function DetailIntro({ title, description, accent, children }: Readonly<DetailIntroProps>) {
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
  title,
  detail,
}: Readonly<{
  title: string;
  detail?: string;
}>) {
  return (
    <div className="mb-4 mt-8 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
      <h2 className="text-xl font-semibold tracking-[-0.035em]">{title}</h2>
      {detail && <p className="max-w-md text-xs leading-5 text-ink-faint sm:text-right">{detail}</p>}
    </div>
  );
}
