import { normalize, proposeMapping, type FieldLike } from './match';

/** Orden de carga: primero lo que otras tablas necesitan (categorías antes que productos, etc.). */
export const IMPORT_ORDER = ['categorias', 'almacenes', 'proveedores', 'clientes', 'productos', 'conductores', 'vehiculos', 'preciosProv'] as const;
export type ImportTable = (typeof IMPORT_ORDER)[number];

/** Nombres con los que suele venir cada hoja. */
const SHEET_NAMES: Record<ImportTable, string[]> = {
    categorias: ['categorias', 'categoria', 'familias', 'familia', 'lineas'],
    almacenes: ['almacenes', 'almacen', 'sedes', 'locales', 'depositos'],
    proveedores: ['proveedores', 'proveedor', 'suppliers'],
    clientes: ['clientes', 'cliente', 'customers'],
    productos: ['productos', 'producto', 'articulos', 'items', 'catalogo', 'inventario'],
    conductores: ['conductores', 'conductor', 'choferes', 'chofer', 'drivers'],
    vehiculos: ['vehiculos', 'vehiculo', 'flota', 'unidades', 'camiones'],
    preciosProv: ['precios proveedor', 'precios por proveedor', 'precios proveedores', 'precios', 'lista precios', 'costos'],
};

/**
 * A qué tabla pertenece una hoja: primero por su nombre («Clientes», «Choferes»…);
 * si el nombre no dice nada, por sus columnas: gana la tabla que más columnas reconoce (tener todas las
 * obligatorias suma). Si le falta una obligatoria igual se asigna, y la pantalla lo marca para que se corrija.
 * Devuelve null si no hay una respuesta clara: el usuario la elige.
 */
export function detectTable(sheetName: string, headers: string[], fieldsOf: (t: ImportTable) => (FieldLike & { required?: boolean })[]): ImportTable | null {
    const n = normalize(sheetName);
    const byName = IMPORT_ORDER.find(t => SHEET_NAMES[t].some(s => normalize(s) === n));
    if (byName) return byName;
    const scored = IMPORT_ORDER.map(t => {
        const fields = fieldsOf(t);
        const mapped = new Set(Object.values(proposeMapping(headers, fields, t)).filter(Boolean));
        const ok = fields.filter(f => f.required).every(f => mapped.has(f.k));
        return { t, score: mapped.size + (ok ? 0.5 : 0), ok };
    }).sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    const clear = best.score > (second?.score ?? 0);
    // Con todas las obligatorias bastan 2 columnas reconocidas; sin ellas, hacen falta al menos 3.
    return clear && (best.ok ? best.score >= 2 : best.score >= 3) ? best.t : null;
}