import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyThemeMode, loadThemeMode } from './lib/theme';
import './index.css';

// Restore a forced theme before first paint so a dark-mode choice never flashes light.
applyThemeMode(loadThemeMode());

const isDemo = import.meta.env.VITE_DEMO === 'true';

if (isDemo) {
  // Installed before the app ever mounts, so the very first widget fetch already lands on
  // fixtures instead of a 404 — see demo/api.ts for what this build has no real server for.
  const { installDemoApi } = await import('./demo/api');
  installDemoApi();
}

const { DemoBanner } = isDemo ? await import('./demo/DemoBanner') : { DemoBanner: undefined };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DemoBanner && <DemoBanner />}
    <App />
  </StrictMode>,
);
