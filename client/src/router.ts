import { useEffect, useState } from 'react';
import { SECTION_IDS, type SectionId } from './sections/registry';

export type Route = { view: 'overview' } | { view: 'section'; sectionId: SectionId; anchor?: string };

function parseHash(): Route {
  const path = window.location.hash.replace(/^#\/?/, '');
  const [id, anchor] = path.split('/');
  return (SECTION_IDS as readonly string[]).includes(id)
    ? { view: 'section', sectionId: id as SectionId, anchor: anchor || undefined }
    : { view: 'overview' };
}

/** Hash-based routing so deep links (#/ai) never hit the server's SPA catch-all. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => {
      // Shared-layout transitions measure the destination during this update.
      // Resetting after render makes the browser move the already-animating element a second time.
      window.scrollTo(0, 0);
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function sectionHref(id: SectionId, anchor?: string): string {
  return anchor ? `#/${id}/${anchor}` : `#/${id}`;
}

export const OVERVIEW_HREF = '#/';
