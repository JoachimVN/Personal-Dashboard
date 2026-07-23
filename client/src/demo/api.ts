// Installed only in the public demo build (see main.tsx, gated on import.meta.env.VITE_DEMO).
// The demo ships as a static site with no backend at all, so every `/api/*` call the app already
// makes has to be answered locally instead. A single window.fetch wrapper is the smallest way to
// do that: every widget, button and drag interaction keeps calling the same real endpoints it
// always does, completely unaware it's talking to fixtures instead of a server.
import type { HueData, WidgetEnvelope } from '@personal-dashboard/shared';
import { buildDemoEnvelopes } from './fixtures';

const LAYOUT_STORAGE_KEY = 'demo-layout';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

function readLayout(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeLayout(layout: Record<string, string[]>): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Private browsing / storage full — the reorder still works for this session, just won't persist.
  }
}

async function bodyOf(init: RequestInit | undefined): Promise<any> {
  if (!init?.body) return {};
  try {
    return JSON.parse(init.body as string);
  } catch {
    return {};
  }
}

/** Wraps window.fetch, answering every `/api/*` route the app calls from static, in-memory
 * fixtures. Widget reads/refreshes are served straight from the fixture set built once at
 * install time; the handful of write endpoints (Hue, layout, code launcher, issue capture,
 * device location) apply optimistically to that same in-memory state so the demo feels alive —
 * they never claim to persist anywhere real. Anything outside `/api/` passes through untouched. */
export function installDemoApi(): void {
  const now = new Date();
  const envelopes = buildDemoEnvelopes(now);
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let path: string;
    try {
      path = new URL(url, window.location.origin).pathname;
    } catch {
      return realFetch(input, init);
    }
    if (!path.startsWith('/api/')) return realFetch(input, init);

    // GET/POST /api/widgets/:id[/refresh]
    const widgetMatch = path.match(/^\/api\/widgets\/([^/]+)(\/refresh)?$/);
    if (widgetMatch) {
      const id = widgetMatch[1];
      const envelope = envelopes[id];
      if (!envelope) return jsonResponse({ id, status: 'loading', refreshMs: 60_000 } satisfies WidgetEnvelope);
      if (widgetMatch[2]) {
        const at = new Date().toISOString();
        envelopes[id] = { ...envelope, fetchedAt: at, lastAttemptAt: at };
      }
      return jsonResponse(envelopes[id]);
    }

    // Hue light/scene/group control — applied optimistically to the in-memory Hue envelope.
    const hueLightMatch = path.match(/^\/api\/hue\/lights\/([^/]+)$/);
    if (hueLightMatch && method === 'POST') {
      const hue = envelopes.hue?.data as HueData | undefined;
      if (hue) {
        const state = await bodyOf(init);
        const light = hue.lights.find((l) => l.id === hueLightMatch[1]);
        if (light) {
          if (typeof state.on === 'boolean') light.on = state.on;
          if (typeof state.brightness === 'number') light.brightness = state.brightness;
        }
      }
      return jsonResponse({ ok: true });
    }
    const hueSceneMatch = path.match(/^\/api\/hue\/scenes\/([^/]+)$/);
    if (hueSceneMatch && method === 'POST') {
      const hue = envelopes.hue?.data as HueData | undefined;
      const scene = hue?.scenes.find((s) => s.id === hueSceneMatch[1]);
      if (hue && scene?.room) {
        const room = hue.rooms.find((r) => r.name === scene.room);
        if (room) room.anyOn = true;
      }
      return jsonResponse({ ok: true });
    }
    const hueGroupMatch = path.match(/^\/api\/hue\/groups\/([^/]+)$/);
    if (hueGroupMatch && method === 'POST') {
      const hue = envelopes.hue?.data as HueData | undefined;
      const room = hue?.rooms.find((r) => r.id === hueGroupMatch[1]);
      if (room) {
        const state = await bodyOf(init);
        if (typeof state.on === 'boolean') room.anyOn = state.on;
      }
      return jsonResponse({ ok: true });
    }

    if (path === '/api/code/projects' && method === 'GET') {
      return jsonResponse({ projects: [{ repo: 'yourname/personal-dashboard' }, { repo: 'yourname/weekend-project' }] });
    }
    if (path === '/api/code/actions' && method === 'POST') {
      return jsonResponse({ ok: true });
    }

    if (path === '/api/github/repos' && method === 'GET') {
      return jsonResponse({ repos: ['yourname/personal-dashboard', 'yourname/weekend-project', 'yourname/dotfiles'] });
    }
    if (path === '/api/github/issues' && method === 'POST') {
      const body = await bodyOf(init);
      return jsonResponse({ number: 43, url: '#', title: body.title });
    }

    if (path === '/api/layout' && method === 'GET') {
      return jsonResponse({ layout: readLayout() });
    }
    const layoutMatch = path.match(/^\/api\/layout\/([^/]+)$/);
    if (layoutMatch && method === 'PUT') {
      const body = await bodyOf(init);
      const layout = readLayout();
      layout[layoutMatch[1]] = Array.isArray(body.order) ? body.order : [];
      writeLayout(layout);
      return jsonResponse({ ok: true });
    }

    if (path === '/api/weather/location' && method === 'POST') {
      return jsonResponse({ ok: true });
    }

    return notFound();
  };
}
