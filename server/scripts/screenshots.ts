// Generates README screenshots against fake, fully-anonymized data (screenshotFixtures.ts): the
// overview (hero + command center) plus the Spotify, Health, AI usage, and GitHub detail pages.
// The overview's command-center ranking runs through the *real* scoring code (importance/
// sources.ts + rank.ts), so that page's output always matches actual behavior. Boots a throwaway
// mock API on :4822, points a scratch Vite client dev server at it, and drives headless Chrome
// over the DevTools protocol to capture each page.
//
// Usage: npm run screenshots -w server
import 'dotenv/config';
import { createServer, type Server } from 'node:http';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WidgetEnvelope } from '@personal-dashboard/shared';
import { rankCandidates } from '../src/importance/rank.js';
import {
  aiCandidates,
  calendarCandidates,
  fallbackCandidates,
  githubCandidates,
  gmailCandidates,
  healthCandidates,
  spotifyCandidates,
} from '../src/importance/sources.js';
import {
  buildAiFixtures,
  githubFixture,
  healthFixture,
  loadFixtures,
  overviewAiClaude,
  overviewAiCodex,
  overviewCalendar,
  overviewGithub,
  overviewGmail,
  overviewHealth,
  weather,
} from './screenshotFixtures.js';

const MOCK_PORT = 4822;
const CLIENT_PORT = 5199;
const CDP_PORT = 9333;
const GMAIL_STALE_MS = 24 * 60 * 60_000;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');
const outDir = path.resolve(repoRoot, 'docs/screenshots');

function envelope<T>(data: T, now: Date = new Date()): WidgetEnvelope<T> {
  const iso = now.toISOString();
  return { id: 'x', status: 'ready', data, fetchedAt: iso, lastAttemptAt: iso, refreshMs: 60_000 };
}

type Daypart = 'night' | 'morning' | 'day' | 'evening';

// Representative hour for each daypart, matching App.tsx's dayPartFor buckets (night<6,
// morning<11, day<18, evening<22, else night) — also picked so the overview's "Good evening"/
// "Good morning" greeting text (a separate client-side computation from the same clock) agrees
// with the forced daypart instead of contradicting it.
const DAYPART_HOUR: Record<Daypart, [number, number]> = {
  night: [2, 0], morning: [8, 30], day: [14, 0], evening: [19, 30],
};

/** Mirrors the in-browser FakeDate script's target time — used so a widget envelope's fetchedAt
 * matches what the page's faked clock will think "now" is. Without this, anything computing
 * elapsed-since-fetch (the Now Playing progress bar, "Synced Xh ago" captions) measures against
 * the real generation time instead and renders nonsense once the browser clock is faked. */
function referenceNow(daypart: Daypart): Date {
  const [hour, minute] = DAYPART_HOUR[daypart];
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface Page {
  slug: string;
  file: string;
  hash: string;
  /** Leaf-element text to scroll to the top of the viewport before capturing — lets a long detail
   * page's most interesting section fill the fixed 16:9 frame instead of just whatever's at the
   * very top. Omit to capture from the top (used for the overview, which already opens on the
   * hero + command center). */
  scrollToText?: string;
  /** 'top' scrolls scrollToText's own heading to just below the sticky header (the default).
   * 'bottom' instead scrolls scrollToText's containing `section.glass` card so its *bottom* edge
   * lands at the viewport's bottom — guarantees the full card is visible regardless of its
   * height, instead of guessing a pixel offset that breaks the next time the content changes. */
  scrollAlign?: 'top' | 'bottom';
  /** Extra scroll (px) applied after the alignment above — positive scrolls further down,
   * negative scrolls back up. */
  extraScroll?: number;
  daypart: Daypart;
  theme: 'light' | 'dark';
  widgets: Record<string, WidgetEnvelope>;
}

async function buildPages(): Promise<Page[]> {
  const fixtures = await loadFixtures();

  const overviewCommandCenter = rankCandidates([
    ...calendarCandidates(overviewCalendar, Date.now()),
    ...gmailCandidates(overviewGmail, undefined, GMAIL_STALE_MS),
    ...githubCandidates(overviewGithub),
    ...healthCandidates(overviewHealth),
    ...spotifyCandidates(fixtures.spotifyOverview, overviewGithub),
    ...aiCandidates([overviewAiClaude, overviewAiCodex]),
    ...fallbackCandidates(),
  ]);

  const overviewNow = referenceNow('evening');
  const spotifyNow = referenceNow('morning');
  const healthNow = referenceNow('day');
  const aiNow = referenceNow('night');
  const githubNow = referenceNow('morning');
  const aiFixtures = buildAiFixtures(aiNow);

  return [
    {
      slug: 'overview', file: '01-overview.png', hash: '', daypart: 'evening', theme: 'dark',
      widgets: {
        'command-center': envelope(overviewCommandCenter, overviewNow),
        calendar: envelope(overviewCalendar, overviewNow),
        weather: envelope(weather, overviewNow),
        github: envelope(overviewGithub, overviewNow),
        health: envelope(overviewHealth, overviewNow),
        spotify: envelope(fixtures.spotifyOverview, overviewNow),
      },
    },
    {
      slug: 'spotify', file: '02-spotify.png', hash: '#/spotify', scrollToText: 'Your rotation', extraScroll: 60,
      daypart: 'morning', theme: 'dark',
      widgets: { spotify: envelope(fixtures.spotifyDetail, spotifyNow) },
    },
    {
      slug: 'health', file: '03-health.png', hash: '#/health', scrollToText: 'Your last 30 days, charted',
      daypart: 'day', theme: 'light',
      widgets: { health: envelope(healthFixture, healthNow) },
    },
    {
      // Bottom-aligning the ai-tool-panel card guarantees both the Claude and Codex cards show
      // in full, which matters more here than the intro headline above them. Anchored on static
      // caption text rather than "As of just now" — that line's wording depends on relative time,
      // which drifts once the page's clock is faked to a fixed daypart. extraScroll nudges a
      // little further down past the alignment default so the card's full bottom margin clears.
      slug: 'ai-usage', file: '04-ai-usage.png', hash: '#/ai', scrollToText: 'Weekly window · last 7 d', scrollAlign: 'bottom', extraScroll: 40,
      daypart: 'night', theme: 'light',
      widgets: { 'ai-usage-claude': envelope(aiFixtures.claude, aiNow), 'ai-usage-codex': envelope(aiFixtures.codex, aiNow) },
    },
    {
      // Bottom-align the Contributions card, then nudge up past its own bottom caption ("N
      // contributions in the last year") so the crop ends on the grid itself.
      slug: 'github', file: '05-github.png', hash: '#/github', scrollToText: 'Contributions', scrollAlign: 'bottom', extraScroll: -50,
      daypart: 'morning', theme: 'dark',
      widgets: { github: envelope(githubFixture, githubNow) },
    },
  ];
}

function freePort(port: number): void {
  try {
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
      .split('\n').map((line) => line.trim()).filter(Boolean);
    for (const pid of pids) process.kill(Number(pid), 'SIGTERM');
    if (pids.length) execSync('sleep 0.5');
  } catch {
    // Nothing listening — fine.
  }
}

function startMockServer(current: () => Page): Server {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/code/projects') {
      res.end(JSON.stringify({ projects: [] }));
      return;
    }
    if (req.url === '/api/github/repos') {
      res.end(JSON.stringify({ repos: [] }));
      return;
    }
    const page = current();
    const id = req.url?.replace(/^\/api\/widgets\//, '') ?? '';
    if (req.url === '/api/widgets') {
      res.end(JSON.stringify({ widgets: Object.keys(page.widgets).map((wid) => ({ id: wid, status: 'ready', refreshMs: 60_000 })) }));
      return;
    }
    const found = page.widgets[id];
    if (found) {
      res.end(JSON.stringify({ ...found, id }));
      return;
    }
    // Anything not covered by the current page's fixtures — render as still-loading, same as a
    // real cold cache, rather than maintaining stub data for every widget on every page.
    res.end(JSON.stringify({ id, status: 'loading', refreshMs: 60_000 }));
  });
  server.listen(MOCK_PORT);
  return server;
}

function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

interface CdpConnection {
  send(method: string, params?: object): Promise<any>;
  close(): void;
}

async function connectCdp(): Promise<CdpConnection> {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', (event) => reject(event), { once: true });
  });
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: any) => void }>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  // Clear out any screenshots from a previous run/naming scheme so stale files don't linger.
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.png')) unlinkSync(path.join(outDir, file));
  }

  console.log('Loading fixtures (fetching real cover art / artist photos)...');
  const pages = await buildPages();
  let currentPage = pages[0];
  freePort(MOCK_PORT);
  const mockServer = startMockServer(() => currentPage);

  console.log(`Starting scratch Vite client on :${CLIENT_PORT}...`);
  freePort(CLIENT_PORT);
  const vite: ChildProcess = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: path.resolve(repoRoot, 'client'),
    stdio: 'ignore',
  });
  await waitForHttp(`http://localhost:${CLIENT_PORT}`, 20_000);

  const profileDir = mkdtempSync(path.join(tmpdir(), 'dashboard-screenshot-'));
  console.log('Launching headless Chrome...');
  freePort(CDP_PORT);
  const chrome: ChildProcess = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--hide-scrollbars',
      '--disable-gpu',
      '--window-size=1600,900',
    ],
    { stdio: 'ignore' },
  );
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, 15_000);
  await sleep(500);

  try {
    const cdp = await connectCdp();
    await cdp.send('Page.enable');
    // Fixed 16:9 viewport — README-friendly aspect ratio matching the rest of the user's repos.
    // No element clipping: each page just scrolls its most interesting section to the top of
    // this frame (see scrollToText below) and we capture exactly what's visible, like a real
    // "above the fold" screenshot rather than the full scrollable page.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1600, height: 900, deviceScaleFactor: 2, mobile: false,
    });

    for (const [index, page] of pages.entries()) {
      currentPage = page;
      console.log(`[${index + 1}/${pages.length}] ${page.slug}`);

      // prefers-color-scheme is what light-dark() actually resolves against — the app's own
      // toggle just sets the `color-scheme` CSS *property*, which controls light-dark() only
      // when color-scheme includes both keywords; forcing the media feature directly is the
      // robust way to control this regardless of the app's own toggle implementation.
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: page.theme }] });

      // Fakes the page's Date so the ambient sky-wash daypart *and* the overview's "Good
      // evening"/"Good morning" greeting (a separate client-side computation off the same clock)
      // agree, regardless of what time this script actually runs at. Only the hour/minute move;
      // the calendar date stays real, so the fixture's "tomorrow" event timing is unaffected.
      const [hour, minute] = DAYPART_HOUR[page.daypart];
      const dateScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const target = new Date();
          target.setHours(${hour}, ${minute}, 0, 0);
          const offset = target.getTime() - Date.now();
          const RealDate = Date;
          class FakeDate extends RealDate {
            constructor(...args) {
              if (args.length === 0) super(RealDate.now() + offset);
              else super(...args);
            }
            static now() { return RealDate.now() + offset; }
          }
          window.Date = FakeDate;
        })();`,
      });
      // A fresh navigation (not a reload) so the hash router reads the target route at mount.
      // The `?shot=N` query param is load-bearing, not decorative: two URLs differing only in
      // their #hash are the same document as far as Chrome's navigation stack is concerned, so
      // addScriptToEvaluateOnNewDocument above never re-fires past the first page — every later
      // page silently kept running page 1's injected Date/theme override. Varying the actual path
      // forces a real navigation each time.
      await cdp.send('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?shot=${index}${page.hash}` });
      await sleep(2_500);
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: dateScript.identifier });

      if (page.scrollToText) {
        const align = page.scrollAlign ?? 'top';
        const found = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const target = [...document.querySelectorAll('h1,h2,h3,p,span')]
              .find((el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(page.scrollToText)});
            if (!target) return false;
            if (${JSON.stringify(align)} === 'bottom') {
              // Align the containing card's *bottom* edge to the viewport bottom, so the full
              // card is guaranteed visible regardless of its height — robust to content changes,
              // unlike a hand-tuned pixel offset.
              (target.closest('section') ?? target).scrollIntoView(false);
              window.scrollBy(0, -16 + ${page.extraScroll ?? 0});
            } else {
              // .detail-header is sticky (top: 1rem) — scrolling the target flush to y=0 tucks
              // it right behind the floating header, so back off by the header's height plus
              // its sticky offset to land just below it instead.
              target.scrollIntoView(true);
              const header = document.querySelector('.detail-header');
              const clearance = (header?.getBoundingClientRect().height ?? 0) + 32;
              window.scrollBy(0, -clearance + ${page.extraScroll ?? 0});
            }
            return true;
          })()`,
          returnByValue: true,
        });
        if (!found.result.value) {
          console.error(`  scroll target "${page.scrollToText}" not found for ${page.slug} — capturing from the top`);
        }
        await sleep(400);
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const outFile = path.join(outDir, page.file);
      writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
      console.log(`  -> ${path.relative(repoRoot, outFile)}`);
    }

    cdp.close();
  } finally {
    // Chrome writes lock/cache files as it shuts down in response to the signal below, so
    // deleting the profile dir immediately after kill() races that and can throw ENOTEMPTY.
    await new Promise<void>((resolve) => {
      chrome.once('exit', () => resolve());
      chrome.kill();
      setTimeout(resolve, 3_000);
    });
    vite.kill();
    mockServer.close();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rmSync(profileDir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 2) console.error(`Could not clean up ${profileDir}:`, err);
        await sleep(500);
      }
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
