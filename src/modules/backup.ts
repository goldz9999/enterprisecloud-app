import { resetModuleCache } from './localStore';

/** Respaldo de los datos de los módulos opcionales (todas las claves «ec-mod-*» de este navegador). */
export function exportModules(): Blob {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // La copia local de Gestión no se respalda: se vuelve a llenar sola con los datos del sistema.
        if (!k || !k.startsWith('ec-mod-') || k.startsWith('ec-mod-copia-')) continue;
        try {
            data[k] = JSON.parse(localStorage.getItem(k) || 'null');
        } catch {
            // clave corrupta: no se incluye
        }
    }
    const body = { app: 'EnterpriseCloud', kind: 'modulos', at: new Date().toISOString(), data };
    return new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
}

/** Restaura un respaldo. Devuelve cuántas claves se restauraron. */
export async function importModules(file: File): Promise<number> {
    let parsed: { kind?: string; data?: Record<string, unknown> };
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error('El archivo no es un JSON válido.');
    }
    if (parsed?.kind !== 'modulos' || !parsed.data || typeof parsed.data !== 'object') {
        throw new Error('El archivo no es un respaldo de módulos de EnterpriseCloud.');
    }
    const keys = Object.keys(parsed.data).filter(k => k.startsWith('ec-mod-') && !k.startsWith('ec-mod-copia-'));
    for (const k of keys) localStorage.setItem(k, JSON.stringify(parsed.data[k]));
    resetModuleCache();
    return keys.length;
}