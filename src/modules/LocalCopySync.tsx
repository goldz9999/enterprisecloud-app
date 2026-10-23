import { useEffect, useRef } from 'react';
import { masterLoaded, isMaster } from '@/data/domain/masters';
import { ensureLoaded, isReady } from '@/data/loadAll';
import { useDB } from '@/data/store';
import { isLoadFailed } from '@/shared/lib/loadStatus';
import { COPY_DOMAINS, hasCopy, mergeCopy, readCopy, writeCopy, type CopyPart } from './localCopy';

/** ¿Esta parte ya se descargó bien del servidor en esta sesión? */
function partReady(p: CopyPart, usersLoaded: boolean): boolean {
    if (p.domain) return isReady(p.domain) && !(p.path && isLoadFailed(p.path));
    if (p.id === 'usuarios') return usersLoaded;
    return isMaster(p.id) && masterLoaded(p.id);
}

/**
 * Mantiene la copia local de Gestión al día: cada vez que los datos del sistema cambian en pantalla,
 * copia lo que ya llegó del servidor (con una pequeña espera para agrupar cambios seguidos).
 * Se monta una sola vez, dentro de la sesión.
 */
export function LocalCopySync() {
    const d = useDB();
    const timer = useRef<number | undefined>(undefined);

    // La primera vez (copia vacía) se piden todas las cargas que la alimentan, para que Gestión tenga datos de entrada.
    useEffect(() => {
        // Se espera a que arranque la sesión (bootData) para no cruzarse con la carga inicial.
        const t = window.setTimeout(() => { if (!hasCopy(readCopy())) ensureLoaded(COPY_DOMAINS); }, 1500);
        return () => window.clearTimeout(t);
    }, []);

    useEffect(() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            const usersLoaded = d.records.usuarios.length > 0;
            const prev = readCopy();
            const next = mergeCopy(prev, d, p => partReady(p, usersLoaded), new Date());
            if (next !== prev) writeCopy(next);
        }, 700);
        return () => window.clearTimeout(timer.current);
    }, [d]);

    return null;
}