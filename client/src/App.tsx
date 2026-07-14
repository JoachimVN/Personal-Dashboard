import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useHashRoute } from './router';
import { useDeviceLocation } from './useDeviceLocation';
import { SECTIONS, sectionById } from './sections/registry';
import { SectionCard } from './sections/SectionCard';
import { SectionView } from './sections/SectionView';
import { SystemFooter } from './components/SystemFooter';
import { DailyCommandCenter } from './components/DailyCommandCenter';
import { ThemeToggle } from './components/ThemeToggle';

type DayPart = 'night' | 'morning' | 'day' | 'evening';

function dayPartFor(hour: number): DayPart {
  if (hour < 6) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  if (hour < 22) return 'evening';
  return 'night';
}

/** Fixed decorative layer the glass cards blur against — a sky wash that shifts with the actual
    time of day, so the color has a reason to be there instead of just sitting for decoration. */
function BackgroundGlow() {
  const now = useCurrentTime();
  return (
    <div
      aria-hidden
      data-daypart={dayPartFor(now.getHours())}
      className="ambient-canvas pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas"
    >
      <div className="ambient-aurora" />
    </div>
  );
}

/** Green color wash behind the whole page, only while the Spotify section is open. */
function SpotifyGlow() {
  return (
    <div aria-hidden className="spotify-page-glow">
      <div className="spotify-page-aurora" />
    </div>
  );
}

const overviewGridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Staggered card entrance runs once per app load, not again when navigating back from a section. */
let overviewEntranceDone = false;

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

function Overview() {
  const now = useCurrentTime();
  const greeting = greetingFor(now.getHours());
  const runEntrance = !overviewEntranceDone;
  useEffect(() => {
    overviewEntranceDone = true;
  }, []);

  return (
    <motion.div
      className="col-start-1 row-start-1 min-w-0"
      initial={false}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.18, ease: 'easeOut' } }}
    >
      <motion.header
        className="dashboard-hero"
        initial={runEntrance ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <span>Oslo</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
        <div className="mt-6 grid items-end gap-5 sm:mt-8 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="hero-title">{greeting}</h1>
          </div>
          <div className="hidden text-right sm:block">
            <p className="hero-time tabular-nums">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      </motion.header>
      <motion.div
        initial={runEntrance ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <DailyCommandCenter />
      </motion.div>
      <div className="dashboard-section-heading">
        <div>
          <p className="command-eyebrow">Sections</p>
          <h2>More detail</h2>
        </div>
        <p>Open a section for the full view.</p>
      </div>
      <motion.div
        className="dashboard-grid grid grid-cols-1 gap-4 lg:grid-cols-12"
        variants={overviewGridVariants}
        initial={runEntrance ? 'hidden' : false}
        animate="visible"
      >
        {SECTIONS.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </motion.div>
      <SystemFooter />
    </motion.div>
  );
}

export default function App() {
  const route = useHashRoute();
  useDeviceLocation();

  return (
    <div className="min-h-screen text-ink selection:bg-(--color-accent-ai)/25">
      <BackgroundGlow />
      {route.view === 'section' && route.sectionId === 'spotify' && <SpotifyGlow />}
      <main className="mx-auto max-w-[78rem] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:px-8 sm:pt-10 lg:px-10">
        <MotionConfig
          reducedMotion="user"
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        >
          <LayoutGroup>
            <div className="relative grid grid-cols-[minmax(0,1fr)]">
              <AnimatePresence mode="popLayout" initial={false}>
                {route.view === 'overview' ? (
                  <Overview key="overview" />
                ) : (
                  <SectionView key={route.sectionId} section={sectionById(route.sectionId)} />
                )}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </MotionConfig>
      </main>
    </div>
  );
}
