import { useEffect, useRef, useState } from 'react';
import { SECTION_IDS, type SectionId } from './sections/registry';

export type Route = { view: 'overview' } | { view: 'section'; sectionId: SectionId; anchor?: string };

function parseHash(): Route {
  const path = window.location.hash.replace(/^#\/?/, '');
  const [id, anchor] = path.split('/');
  return (SECTION_IDS as readonly string[]).includes(id)
    ? { view: 'section', sectionId: id as SectionId, anchor: anchor || undefined }
    : { view: 'overview' };
}

function routeKey(route: Route): string {
  return route.view === 'overview' ? 'overview' : route.sectionId;
}

/** Where each route was left, so returning to the overview lands on the card you opened
    instead of back at the top. Module-level, so it survives remounts but not a reload. */
const scrollOffsets = new Map<string, number>();

/**
 * Shared-layout transitions measure the card and its destination header during the route
 * update, so the destination's scroll offset has to already be applied — resetting after
 * render makes the browser move the already-animating element a second time.
 *
 * That means scrolling while the *outgoing* page is still the one in the DOM, and a short
 * page would clamp a large offset back down. The temporary min-height holds the room open
 * until the incoming page supplies its own height (cleared right after the commit).
 */
function applyScroll(offset: number): void {
  if (offset > 0) document.body.style.minHeight = `${offset + window.innerHeight}px`;
  window.scrollTo(0, offset);
}

/** Hash-based routing so deep links (#/ai) never hit the server's SPA catch-all. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const onChange = () => {
      scrollOffsets.set(routeKey(routeRef.current), window.scrollY);
      const next = parseHash();
      // Sections always open at their top; the overview returns to where it was.
      applyScroll(next.view === 'overview' ? scrollOffsets.get('overview') ?? 0 : 0);
      setRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    // The incoming page is in the DOM now and carries its own height.
    document.body.style.minHeight = '';
  }, [route]);

  return route;
}

export function sectionHref(id: SectionId, anchor?: string): string {
  return anchor ? `#/${id}/${anchor}` : `#/${id}`;
}

export const OVERVIEW_HREF = '#/';
