import { useEffect } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useHashRoute } from './router';
import { SECTIONS, sectionById } from './sections/registry';
import { SectionCard } from './sections/SectionCard';
import { SectionView } from './sections/SectionView';
import { SystemFooter } from './components/SystemFooter';

/** Fixed decorative layer the glass cards blur against — accent-tinted glow blobs on the canvas. */
function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div
        className="absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-ai) 22%, transparent), transparent)',
        }}
      />
      <div
        className="absolute top-1/3 -right-48 h-[40rem] w-[40rem] rounded-full opacity-50"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-github) 20%, transparent), transparent)',
        }}
      />
      <div
        className="absolute -bottom-48 left-1/4 h-[38rem] w-[38rem] rounded-full opacity-50"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-personal) 18%, transparent), transparent)',
        }}
      />
    </div>
  );
}

const overviewGridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Staggered card entrance runs once per app load, not again when navigating back from a section. */
let overviewEntranceDone = false;

function Overview() {
  const runEntrance = !overviewEntranceDone;
  useEffect(() => {
    overviewEntranceDone = true;
  }, []);

  return (
    <motion.div exit={{ opacity: 0, transition: { duration: 0.15 } }}>
      <h1 className="mb-4 text-lg font-bold sm:mb-6">Dashboard</h1>
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <BackgroundGlow />
      <main className="mx-auto max-w-6xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-6">
        <MotionConfig
          reducedMotion="user"
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        >
          <LayoutGroup>
            <AnimatePresence mode="popLayout" initial={false}>
              {route.view === 'overview' ? (
                <Overview key="overview" />
              ) : (
                <SectionView key={route.sectionId} section={sectionById(route.sectionId)} />
              )}
            </AnimatePresence>
          </LayoutGroup>
        </MotionConfig>
      </main>
    </div>
  );
}
