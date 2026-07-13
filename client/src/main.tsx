import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyThemeMode, loadThemeMode } from './lib/theme';
import './index.css';

// Restore a forced theme before first paint so a dark-mode choice never flashes light.
applyThemeMode(loadThemeMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
