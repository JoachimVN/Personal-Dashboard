import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandPanel, HeroPanel, Signal, SecondaryCardBody, aiUsageTiles, heroPropsFor, secondaryArt, toneFor, weatherPanelStyle } from '../DailyCommandCenter';
import { buildGalleryData, buildGallerySlots, type GallerySlot } from '../../demo/fixtures/slotGallery';

/**
 * Dev-only page (see App.tsx's `?dev=gallery`) that renders every `CommandCenterSlot.render`
 * variant the hero/tile/secondary positions support — one card each, standalone, using synthetic
 * fixture data instead of live widgets. Reuses the real `HeroPanel`/`Signal`/`SecondaryCardBody`
 * components so what you see here is exactly what production would render for that slot, not a
 * reimplementation that can drift from it.
 */

/**
 * The hero and secondary cards don't have a width of their own in production — they're sized by
 * their position in `.command-layout`'s `minmax(0, 1.75fr) minmax(18rem, 0.8fr)` grid (hero) or by
 * `.command-center`'s own content width (secondary), both of which depend on the viewport. Rather
 * than guess a rem value that approximates that (tried twice, both wrong), this renders one real,
 * invisible instance of that exact structure and measures it, so the gallery cards below are
 * pinned to the literal pixel width production would give them at the current viewport.
 */
function useProductionWidths(): { hero: number | undefined; secondary: number | undefined; rig: ReactNode } {
  const heroRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<{ hero: number | undefined; secondary: number | undefined }>({ hero: undefined, secondary: undefined });

  useLayoutEffect(() => {
    const measure = () => setWidths({
      hero: heroRef.current?.getBoundingClientRect().width,
      secondary: secondaryRef.current?.getBoundingClientRect().width,
    });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Zero-height so it never affects page layout, but not `display:none` — that would make the
  // grid report a width of 0 instead of what it'd actually render at.
  const rig = (
    <div aria-hidden className="command-center glass" style={{ height: 0, overflow: 'hidden', padding: 0, border: 'none' }}>
      <div className="command-layout" style={{ marginTop: 0 }}>
        <div ref={heroRef} className="command-primary" />
        <div className="command-signals"><div className="command-signal" /></div>
      </div>
      <div ref={secondaryRef} className="command-agenda" />
    </div>
  );

  return { ...widths, rig };
}

function GalleryCard({ label, width, children }: Readonly<{ label: string; width?: number; children: ReactNode }>) {
  return (
    <div className="min-w-0" style={width ? { width } : undefined}>
      <p className="mb-1.5 truncate font-mono text-[11px] text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function GallerySection({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

export function SlotGallery() {
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);
  const { data, slots } = useMemo(() => {
    const now = new Date();
    const data = buildGalleryData(now);
    return { data, slots: buildGallerySlots(data, now) };
  }, []);
  const { hero: heroWidth, secondary: secondaryWidth, rig } = useProductionWidths();

  return (
    <div className="mx-auto max-w-[78rem] px-4 pb-16 pt-6 sm:px-8 sm:pt-10 lg:px-10">
      {rig}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">Dev tool</p>
        <h1 className="hero-title">What&apos;s next — slot gallery</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Every render variant a hero/tile/secondary slot supports ({slots.length} total), each shown
          on its own with synthetic fixture data — not combined, not your live widgets.
        </p>
      </header>

      <GallerySection title={`Hero renders (${slots.length})`}>
        {/* Width is measured off a real, invisible .command-layout (see useProductionWidths above) —
            the hero's actual pixel width at this viewport, not an approximation. */}
        <div className="flex flex-wrap gap-6">
          {slots.map(({ label, slot }: GallerySlot) => (
            <GalleryCard key={slot.id} label={label} width={heroWidth}>
              <HeroPanel hero={slot} {...heroPropsFor(slot, { ...data, hoveredDay, onHover: setHoveredDay })} weather={data.weather} />
            </GalleryCard>
          ))}
        </div>
      </GallerySection>

      <GallerySection title={`Tile renders (${slots.length})`}>
        {/* Tiles genuinely are narrow in production — they stack inside .command-layout's 0.8fr
            column — so a multi-column grid here is accurate, unlike hero/secondary above/below. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map(({ label, slot }: GallerySlot) => (
            <GalleryCard key={slot.id} label={label}>
              <div className="command-signals">
                {aiUsageTiles(slot, data.aiUsage).map((tile) => (
                  <Signal key={tile.id} slot={tile} github={data.github} health={data.health} roblox={data.roblox} spotify={data.spotify} steam={data.steam} />
                ))}
              </div>
            </GalleryCard>
          ))}
        </div>
      </GallerySection>

      <GallerySection title={`Secondary renders (${slots.length})`}>
        {/* Same measured-width approach as hero above — the secondary card is a sibling below
            .command-layout, sized by .command-center's own content width, not hero's grid column. */}
        <div className="flex flex-wrap gap-6">
          {slots.map(({ label, slot }: GallerySlot) => (
            <GalleryCard key={slot.id} label={label} width={secondaryWidth}>
              <CommandPanel
                href={slot.href}
                label={`Open ${slot.kicker}: ${slot.title}`}
                className={`command-agenda command-panel--${toneFor(slot)}`}
                fullCardLink
                style={weatherPanelStyle(slot)}
                art={secondaryArt(slot)}
              >
                {/* Matches the wrapper SecondaryCarousel gives a single item in production — several
                    secondary bodies (e.g. the Roblox icon) size off custom properties this div
                    defines, and render at native/huge size without it. */}
                <div className="command-secondary-carousel">
                  <SecondaryCardBody
                    slot={slot}
                    calendar={data.calendar}
                    spotify={data.spotify}
                    spotifyFetchedAt={data.spotifyFetchedAt}
                    health={data.health}
                    github={data.github}
                    gmail={data.gmail}
                    weather={data.weather}
                    steam={data.steam}
                    roblox={data.roblox}
                    aiUsage={data.aiUsage}
                    hoveredDay={hoveredDay}
                    onHover={setHoveredDay}
                  />
                </div>
              </CommandPanel>
            </GalleryCard>
          ))}
        </div>
      </GallerySection>
    </div>
  );
}
