import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ec-theme';
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage may be unavailable (private mode); theme still applies for this page.
  }
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Theme lives on <html data-theme> (set pre-paint in index.html) and is persisted across screens.
 * Every component using this hook re-renders when any of them changes it.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme);
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'), setTheme };
}
