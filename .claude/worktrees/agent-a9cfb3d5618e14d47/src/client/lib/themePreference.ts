/**
 * Theme preference management
 * - Detect system preference (prefers-color-scheme)
 * - Read/write localStorage
 * - Initialize theme on app start
 * - Default: Dark mode
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wxkanban-theme-preference';

/**
 * Detect system theme preference
 * Returns 'dark' if system prefers dark mode, 'light' otherwise
 */
export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'; // SSR fallback

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery.matches ? 'dark' : 'light';
}

/**
 * Get user's stored theme preference from localStorage
 * Returns null if not set
 */
export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null; // SSR

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return null;
}

/**
 * Save theme preference to localStorage
 */
export function saveTheme(theme: Theme): void {
  if (typeof window === 'undefined') return; // SSR
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Initialize theme on app start
 * Priority: stored preference > default to 'dark'
 */
export function initializeTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;

  return 'dark';
}

/**
 * Apply theme to document
 * - Set data-theme attribute on <html>
 * - Set color-scheme CSS property
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return; // SSR

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  // Tailwind class-based dark mode
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Toggle between light and dark
 */
export function toggleTheme(current: Theme): Theme {
  const next = current === 'light' ? 'dark' : 'light';
  saveTheme(next);
  applyTheme(next);
  return next;
}
