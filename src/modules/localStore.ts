import { useCallback, useSyncExternalStore } from 'react';

/**
 * Datos propios de cada módulo opcional (metas, reglas de comisión, conteos, entregas…).
 * Viven en este navegador, con una clave versionada por módulo: «ec-mod-<id>-v1».
 * No se mezclan con el store principal (que se recarga del servidor) ni con otros módulos.
 */
export const moduleKey = (id: string, version = 1) => `ec-mod-${id}-v${version}`;

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

export function readModule<T>(id: string, fallback: T): T {
    const k = moduleKey(id);
    if (cache.has(k)) return cache.get(k) as T;
    let value = fallback;
    try {
        const raw = localStorage.getItem(k);
        if (raw) value = JSON.parse(raw) as T;
    } catch {
        value = fallback; // sin almacenamiento o dato corrupto: se empieza vacío
    }
    cache.set(k, value);
    return value;
}

export function writeModule<T>(id: string, value: T) {
    const k = moduleKey(id);
    cache.set(k, value);
    try {
        localStorage.setItem(k, JSON.stringify(value));
    } catch {
        // almacenamiento lleno o bloqueado: el valor queda en memoria hasta cerrar la pestaña
    }
    listeners.forEach(l => l());
}

/** Olvida lo leído (p. ej. tras importar un respaldo) para volver a leer del navegador. */
export function resetModuleCache() {
    cache.clear();
    listeners.forEach(l => l());
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

/** Hook: [valor, guardar] para el estado propio de un módulo. */
export function useModuleStore<T>(id: string, fallback: T): [T, (next: T) => void] {
    const value = useSyncExternalStore(subscribe, () => readModule(id, fallback));
    const set = useCallback((next: T) => writeModule(id, next), [id]);
    return [value, set];
}

/** Identificador corto y único para registros locales. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);