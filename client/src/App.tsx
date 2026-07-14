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

/** Fixed decorative layer the glass cards blur against — accent-tinted glow blobs on the canvas. */
function BackgroundGlow() {
  return (
    <div aria-hidden className="ambient-canvas pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div className="ambient-orb ambient-orb--one" />
      <div className="ambient-orb ambient-orb--two" />
      <div className="ambient-orb ambient-orb--three" />
      <div className="ambient-grid" />
      <div className="ambient-noise" />
    </div>
  );
}

/** Green gradient wash + spotlights behind the whole page, only while the Spotify section is open. */
function SpotifyGlow() {
  return (
    <div aria-hidden className="spotify-page-glow">
      <div className="spotify-page-orb spotify-page-orb--one" />
      <div className="spotify-page-orb spotify-page-orb--two" />
      <div className="spotify-page-orb spotify-page-orb--three" />
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
    <motion.div className="col-start-1 row-start-1">
      <motion.header
        className="dashboard-hero"
        initial={runEntrance ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <span className="live-indicator"><span /></span>
          <span>Personal system</span>
          <span className="text-ink-faint">/</span>
          <span className="text-ink-faint">Oslo</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
        <div className="mt-6 grid items-end gap-5 sm:mt-8 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="hero-title">{greeting}<br /><span>Here is the signal.</span></h1>
          </div>
          <div className="hidden text-right sm:block">
            <p className="hero-time tabular-nums">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="mt-1 text-xs text-ink-faint">Your day at a glance</p>
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
          <p className="command-eyebrow">Your system</p>
          <h2>Go deeper</h2>
        </div>
        <p>Open a section for the complete picture and quick actions.</p>
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
            <div className="grid">
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
