import { useSyncExternalStore } from 'react';

const KEY = 'ec-session';
const listeners = new Set<() => void>();

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  area: string | null;
  lastLoginAt: string | null;
  role: { id: string; code: string; name: string };
}

/** Effective permissions from the backend: module key (e.g. "sales-orders") → allowed actions (e.g. ["view", "edit"]). */
export type PermissionMap = Record<string, string[]>;

export interface Session {
  email: string;
  /** ISO time of sign-in. */
  since: string;
  /** Bearer token issued by the backend. */
  token: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
  user: SessionUser;
  permissions: PermissionMap;
}

let current: Session | null = read();
/** Where the session is stored: localStorage ("remember") or sessionStorage (until the tab closes). */
let remembered = !!safeGet(localStorage);
/** True after the user signed out on purpose (vs. an expired session), so we don't send them back to where they were. */
let signedOut = false;

export const wasSignedOut = () => signedOut;

function safeGet(store: Storage): string | null {
  try {
    return store.getItem(KEY);
  } catch {
    return null;
  }
}

function read(): Session | null {
  try {
    const raw = safeGet(localStorage) ?? safeGet(sessionStorage);
    const s = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    // Sessions saved by the old local-only login have no token: ignore them.
    return s && s.token && s.user && s.permissions && s.expiresAt ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return current;
}

function persist(s: Session | null) {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (s) (remembered ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: the session lasts until the tab closes.
  }
}

/** `remember: false` keeps the session only until the tab is closed. */
export function setSession(s: Session | null, remember = true, explicit = false) {
  current = s;
  signedOut = !s && explicit;
  remembered = remember;
  persist(s);
  listeners.forEach(l => l());
}

/** Updates the signed-in user's data / permissions (after /auth/me) without changing where it is stored. */
export function patchSession(patch: Partial<Pick<Session, 'user' | 'permissions'>>) {
  if (!current) return;
  current = { ...current, ...patch };
  persist(current);
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession);
}