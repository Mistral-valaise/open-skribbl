import { create } from 'zustand';

/**
 * The colour theme (spec 011). `public/theme.js` decides the theme before the
 * first paint and writes it to `data-theme` on `<html>`; this module takes
 * over from there and remembers the toggle's choice.
 */
export type Theme = 'dark' | 'light';

/** The same key as in `public/theme.js`. */
export const THEME_STORAGE_KEY = 'kritzel.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** The stored choice wins; without one the system preference decides (AC-011-01). */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? 'light' : 'dark';
}

function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const applied = document.documentElement.getAttribute('data-theme');
  if (isTheme(applied)) return applied;
  // The head script did not run: decide here instead.
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage is blocked.
  }
  return resolveTheme(stored, window.matchMedia('(prefers-color-scheme: light)').matches);
}

export const useThemeStore = create<{ theme: Theme }>(() => ({ theme: initialTheme() }));

/** Makes `<html>` show the store's theme; needed only when the head script did not run. */
export function applyDocumentTheme(): void {
  document.documentElement.setAttribute('data-theme', useThemeStore.getState().theme);
}

/** Switches the theme at once and remembers the choice (AC-011-02). */
export function setTheme(theme: Theme): void {
  useThemeStore.setState({ theme });
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice then lasts for this visit only.
  }
  applyDocumentTheme();
}

export const otherTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');
