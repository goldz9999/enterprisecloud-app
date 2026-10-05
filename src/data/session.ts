import { useSyncExternalStore } from 'react';

const KEY = 'ec-session';
const listeners = new Set<() => void>();

export interface Session {
  email: string;
  /** ISO time of sign-in. */
  since: string;
}

let current: Session | null = read();
/** True after the user signed out on purpose (vs. an expired session), so we don't send them back to where they were. */
let signedOut = false;

export const wasSignedOut = () => signedOut;

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return current;
}

/** `remember: false` keeps the session only until the tab is closed. */
export function setSession(s: Session | null, remember = true, explicit = false) {
  current = s;
  signedOut = !s && explicit;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (s) (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: the session lasts until the tab closes.
  }
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession);
}
