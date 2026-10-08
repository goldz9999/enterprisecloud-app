import { useSyncExternalStore } from 'react';

/**
 * Lecturas al backend que siguen fallando tras los reintentos. Permite avisar al usuario en vez de mostrar un
 * estado vacío ("Aún no hay registros") que parece que los datos no existen.
 */
const failed = new Set<string>();
const listeners = new Set<() => void>();
let count = 0;

function emit() {
  count = failed.size;
  listeners.forEach(l => l());
}

export function noteLoad(path: string, ok: boolean) {
  const before = failed.size;
  if (ok) failed.delete(path);
  else failed.add(path);
  if (failed.size !== before) emit();
}

export function clearLoadFailures() {
  if (!failed.size) return;
  failed.clear();
  emit();
}

/** Cantidad de lecturas fallidas pendientes de reintento. */
export function useLoadFailures(): number {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count,
  );
}
