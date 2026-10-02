import { useCallback, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ec-theme';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Theme is stored on <html data-theme> (set pre-paint in index.html) and persisted across screens. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); theme still applies for this page.
    }
    setTheme(next);
  }, []);

  return { theme, toggle };
}
