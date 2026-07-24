/**
 * Shared timing for the overview ⇄ section page transition. The pieces live together
 * because they have to be choreographed against each other: the card morph, the page
 * crossfade and the detail body entrance all start from the same click.
 */

/** The app-wide default (App.tsx MotionConfig): hover lifts, press, widget movement. */
export const UI_SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const;

/**
 * The card → detail-header morph. A `transition` prop replaces the MotionConfig default
 * outright, so this re-states UI_SPRING for everything else the card animates (hover lift,
 * tap scale, entrance variants) and overrides only `layout`: a shared-element morph that
 * overstays reads as lag, where a soft hover bounce does not.
 */
export const SECTION_MORPH_TRANSITION = {
  ...UI_SPRING,
  layout: { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 },
} as const;

/**
 * Outgoing page. Opacity only, and short: this runs on the whole page subtree, and every
 * glass surface under it carries a `backdrop-filter`, so animating anything that forces a
 * re-raster (a `filter: blur()` in particular) re-blurs all of them every frame — visibly
 * on a phone. It also has to clear quickly because the element morphing underneath it is
 * part of the same subtree, and a slow fade leaves a ghost travelling with it.
 */
export const PAGE_EXIT = {
  opacity: 0,
  transition: { duration: 0.16, ease: 'easeOut' },
} as const;

/**
 * Detail body. Starts just after the outgoing page begins to clear so the two overlap into
 * a crossfade, rather than waiting for the morph and leaving the page briefly empty.
 */
export const DETAIL_BODY_ENTER = {
  opacity: 1,
  y: 0,
  transition: { duration: 0.34, ease: [0.2, 0.8, 0.2, 1], delay: 0.08 },
} as const;

/** The section's accent wash. Slower than the page swap — it is atmosphere, not chrome. */
export const SECTION_GLOW_ENTER = { duration: 0.5, ease: 'easeOut' } as const;
export const SECTION_GLOW_EXIT = { duration: 0.32, ease: 'easeIn' } as const;
