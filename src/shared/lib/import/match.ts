import { SYNONYMS } from './synonyms';

export interface FieldLike {
    k: string;
    label: string;
}

/** Texto comparable: sin tildes, en minúsculas, sin signos y con un solo espacio («N.º Teléfono» → «n telefono»). */
export const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/º|°/g, '')
        .replace(/[^a-z0-9]+/g, ' ').replace(/\b(de|del|la|el|n|no|nro|num)\b/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Propone qué campo corresponde a cada columna del archivo (índice → clave, o null si no se reconoce).
 * Es determinista: el mismo archivo da siempre el mismo resultado, y nunca usa un campo dos veces.
 * Orden de preferencia: etiqueta del formulario › sinónimo exacto › coincidencia parcial.
 */
export function proposeMapping(headers: string[], fields: FieldLike[], collection = ''): Record<number, string | null> {
    const syn = SYNONYMS[collection] ?? {};
    const own = new Map(fields.map(f => [f.k, [normalize(f.label), normalize(f.k)].filter(Boolean)]));
    const alt = new Map(fields.map(f => [f.k, (syn[f.k] ?? []).map(normalize).filter(Boolean)]));
    const out: Record<number, string | null> = Object.fromEntries(headers.map((_, i) => [i, null]));
    const used = new Set<string>();
    const pass = (names: Map<string, string[]>, test: (h: string, n: string) => boolean) =>
        headers.forEach((raw, i) => {
            if (out[i]) return;
            const h = normalize(raw);
            if (!h) return;
            const hit = fields.find(f => !used.has(f.k) && names.get(f.k)!.some(n => test(h, n)));
            if (hit) { out[i] = hit.k; used.add(hit.k); }
        });
    const exact = (h: string, n: string) => h === n;
    const partial = (h: string, n: string) => n.length >= 4 && h.length >= 4 && (h.includes(n) || n.includes(h));
    pass(own, exact);
    pass(alt, exact);
    pass(own, partial);
    pass(alt, partial);
    return out;
}