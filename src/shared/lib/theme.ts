import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ec-theme';
const SIDEBAR_KEY = 'ec-sidebar-follows-theme';
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(next: Theme) {
  // Transición suave solo durante el cambio (ver .theme-switching en polish.css)
  const root = document.documentElement;
  root.classList.add('theme-switching');
  window.setTimeout(() => root.classList.remove('theme-switching'), 350);
  root.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage may be unavailable (private mode); theme still applies for this page.
  }
  listeners.forEach(l => l());
}

function readSidebarFollows(): boolean {
  return document.documentElement.dataset.sidebar === 'sync';
}

/**
 * Preferencia del sidebar: activada, el sidebar cambia a claro/oscuro junto con el tema;
 * desactivada, se queda oscuro siempre. Vive en <html data-sidebar="sync"> (se aplica antes de pintar en index.html).
 */
export function setSidebarFollowsTheme(on: boolean) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  window.setTimeout(() => root.classList.remove('theme-switching'), 350);
  if (on) root.dataset.sidebar = 'sync';
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, on ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode); la preferencia aplica solo en esta página.
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

export function useSidebarFollowsTheme() {
  const on = useSyncExternalStore(subscribe, readSidebarFollows);
  return { sidebarFollowsTheme: on, setSidebarFollowsTheme };
}