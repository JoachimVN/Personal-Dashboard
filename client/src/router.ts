import { useEffect, useState } from 'react';
import { SECTION_IDS, type SectionId } from './sections/registry';

export type Route = { view: 'overview' } | { view: 'section'; sectionId: SectionId };

function parseHash(): Route {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (SECTION_IDS as readonly string[]).includes(id)
    ? { view: 'section', sectionId: id as SectionId }
    : { view: 'overview' };
}

/** Hash-based routing so deep links (#/ai) never hit the server's SPA catch-all. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function sectionHref(id: SectionId): string {
  return `#/${id}`;
}

export const OVERVIEW_HREF = '#/';
