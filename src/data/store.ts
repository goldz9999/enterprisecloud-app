import { useSyncExternalStore } from 'react';
import { clearFiles } from './files';
import { buildDemoDB, buildEmptyDB } from './seed';
import { getSession } from './session';
import type { DB, Row } from './types';

/**
 * The whole app's data lives in one object persisted to localStorage.
 * Components read it with useDB(); every change goes through update(), which
 * clones, mutates the draft, saves and notifies — so all screens stay in sync.
 */
const KEY = 'ec-db-v1';
const listeners = new Set<() => void>();
let db: DB = load();

/** Fills in anything missing from older saved data or backups. */
function normalize(parsed: DB): DB {
  const empty = buildEmptyDB();
  return {
    ...empty,
    ...parsed,
    records: { ...empty.records, ...parsed.records },
    history: { ...empty.history, ...parsed.history },
    settings: { ...empty.settings, ...parsed.settings },
    alertsRead: parsed.alertsRead ?? [],
    counters: parsed.counters ?? {},
  };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 1) return normalize(parsed);
    }
  } catch {
    // Corrupt or unavailable storage: start from the sample data.
  }
  return buildDemoDB();
}

let saveError = '';

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    saveError = '';
  } catch (e) {
    saveError = 'No se pudo guardar en este navegador: ' + (e instanceof Error ? e.message : String(e));
    console.error(saveError);
  }
}

function emit() {
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Keep several open tabs in sync.
window.addEventListener('storage', e => {
  if (e.key === KEY && e.newValue) {
    try {
      db = normalize(JSON.parse(e.newValue) as DB);
      emit();
    } catch {
      /* ignore */
    }
  }
});

export function getDB(): DB {
  return db;
}

export function getSaveError(): string {
  return saveError;
}

/** Subscribes the component to the store; re-renders on every change. */
export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB);
}

/** Applies a change to a draft copy of the data, then persists and notifies. Returns fn's result. */
export function update<T>(fn: (draft: DB) => T): T {
  const draft = structuredClone(db);
  const result = fn(draft);
  db = draft;
  save();
  emit();
  return result;
}

/**
 * Like update(), but fn may return an error message: then nothing is saved.
 * Returns the error, or undefined when the change was applied.
 */
export function mutate(fn: (draft: DB) => string | void): string | undefined {
  const draft = structuredClone(db);
  const err = fn(draft);
  if (err) return err;
  db = draft;
  save();
  emit();
  return undefined;
}

export function replaceDB(next: DB) {
  db = next;
  save();
  emit();
}

/** Discards everything and reloads the sample data. */
export function resetToDemo() {
  clearFiles().catch(() => {});
  replaceDB(buildDemoDB());
}

/**
 * Removes all sample business data so the app can be used with real data.
 * Keeps configuration (settings, roles, permissions) and the signed-in user, as Administrador.
 */
export function clearSampleData() {
  const me = currentUser(db);
  const next = buildEmptyDB({ settings: db.settings, permisos: db.permisos, roles: db.records.roles });
  next.records.usuarios = [{ _id: 1, nombre: me.name, correo: me.email, rol: 'Administrador', area: me.area || 'Gerencia', acceso: 'Hoy', mfa: 'Desactivado', estado: 'Activo', ...(me.password ? { password: me.password } : {}) }];
  clearFiles().catch(() => {});
  replaceDB(next);
}

export function exportBackup(): string {
  return JSON.stringify(db, null, 2);
}

export function importBackup(text: string) {
  const parsed = JSON.parse(text) as DB;
  if (!parsed || parsed.version !== 1 || !parsed.records) throw new Error('El archivo no es un respaldo válido de EnterpriseCloud.');
  replaceDB(normalize(parsed));
}

// ---------- helpers shared by domain code ----------

export interface CurrentUser {
  name: string;
  email: string;
  role: string;
  area: string;
  password?: string;
  row?: Row;
}

/** The signed-in user, resolved against the Usuarios collection. */
export function currentUser(d: DB = db): CurrentUser {
  const email = getSession()?.email ?? '';
  const row = d.records.usuarios.find(u => String(u.correo).toLowerCase() === email.toLowerCase());
  if (row) return { name: String(row.nombre), email: String(row.correo), role: String(row.rol), area: String(row.area ?? ''), password: row.password as string | undefined, row };
  return { name: email ? email.split('@')[0] : 'Invitado', email, role: 'Administrador', area: '' };
}

/** Next free _id in a list of rows. */
export function nextId(rows: { _id: number }[]): number {
  return rows.reduce((m, r) => Math.max(m, r._id), 0) + 1;
}

/**
 * Next document number for a prefix, e.g. nextCode(d, 'OV-2026-', 4) → "OV-2026-1285".
 * The first time a prefix is used, it starts after the highest number already present in the data
 * (or in `scope`, when other documents could share the prefix — e.g. supplier invoices).
 */
export function nextCode(d: DB, prefix: string, width: number, scope?: unknown): string {
  if (d.counters[prefix] == null) {
    const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)', 'g');
    let max = 0;
    for (const m of JSON.stringify(scope ?? d).matchAll(re)) max = Math.max(max, Number(m[1]));
    d.counters[prefix] = max;
  }
  d.counters[prefix] += 1;
  return prefix + String(d.counters[prefix]).padStart(width, '0');
}
