/**
 * Theme override for the light-dark() token system. Every color token resolves via the
 * :root `color-scheme`, so forcing a mode is just overriding that one property inline;
 * 'auto' removes the override and follows the OS again.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark'];

const STORAGE_KEY = 'dashboard-theme';

export function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.style.colorScheme = mode === 'auto' ? '' : mode;
  try {
    if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort; the applied mode still holds for this session.
  }
}
