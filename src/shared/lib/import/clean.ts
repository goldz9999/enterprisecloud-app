/** Campos que son montos o cantidades en cada pantalla. */
const NUMERIC = new Set(['linea', 'precio', 'costo', 'min', 'cant']);

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** «S/ 1.234,50», «1,234.50» o «1234.5» → «1234.5». Si no es un número, lo deja igual (la validación lo marcará). */
export function toNumber(v: string): string {
    let s = v.replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return v;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : v;
}

const YES = /^(si|s|yes|y|1|true|verdadero|x|activo|afecto|gravado)$/;
const NO = /^(no|n|0|false|falso|inactivo|baja|inafecto|exonerado)$/;

/**
 * Corrige lo que Excel suele estropear, sin inventar datos: si algo no se puede interpretar, queda igual
 * y la validación de la fila lo marcará como error. `row` son los demás valores ya leídos de la misma fila.
 */
export function cleanValue(field: string, value: string, row: Record<string, string> = {}): string {
    const v = value.trim();
    if (!v) return '';
    const s = strip(v);
    if (NUMERIC.has(field)) return toNumber(v);
    if (field === 'estado') return NO.test(s) ? 'Inactivo' : YES.test(s) ? 'Activo' : v;
    if (field === 'igv') return NO.test(s) ? 'No' : YES.test(s) ? 'Sí' : v;
    if (field === 'tdoc') return /^ruc/.test(s) ? 'RUC' : /^dni|^d n i/.test(s) ? 'DNI' : /^(ce|carnet|c e)/.test(s) ? 'CE' : v.toUpperCase();
    if (field === 'ndoc' || field === 'ruc' || field === 'dni') {
        const digits = v.replace(/[\s.-]/g, '');
        // Excel borra el cero inicial de los DNI (07251385 → 7251385). Solo se corrige si se sabe que ES un DNI:
        // con 7 dígitos y sin tipo de documento podría ser un RUC incompleto, y eso no se adivina.
        const dni = field === 'dni' || row.tdoc === 'DNI';
        return /^\d{7}$/.test(digits) && dni ? digits.padStart(8, '0') : digits;
    }
    if (field === 'cond') {
        if (/contado/.test(s) || s === '0') return 'Contado';
        const days = /(\d+)/.exec(s)?.[1];
        return days ? `Crédito ${days} días` : v;
    }
    if (field === 'tipo' && row.__collection === 'almacenes') {
        return /^princ|^main/.test(s) ? 'Principal' : /^secund|^second/.test(s) ? 'Secundario' : /^trans/.test(s) ? 'Tránsito' : v;
    }
    if (field === 'placa') {
        // Formato peruano «ABC-123»: «f3q 920» o «F3Q920» → «F3Q-920».
        const p = v.toUpperCase().replace(/[\s-]+/g, '');
        return /^[A-Z0-9]{6}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : v.toUpperCase().trim();
    }
    if (field === 'margen') return toNumber(v.replace('%', '')) + '%';
    return v;
}

/** Si el archivo no trae «Tipo de documento», se deduce del número: 11 dígitos = RUC, 8 = DNI. */
export function inferDocType(row: Record<string, string>): Record<string, string> {
    if (row.tdoc || !row.ndoc) return row;
    const n = row.ndoc.replace(/\D/g, '');
    // Si no es ni 11 ni 8 dígitos no se adivina: la fila se marca con error (ver importBody).
    return n.length === 11 ? { ...row, tdoc: 'RUC' } : n.length === 8 ? { ...row, tdoc: 'DNI' } : row;
}

/** Limpia todos los valores de una fila ya emparejada (claves del formulario). El tipo de documento va primero. */
export function cleanRow(collection: string, vals: Record<string, string>): Record<string, string> {
    const ctx: Record<string, string> = { __collection: collection };
    if (vals.tdoc) ctx.tdoc = cleanValue('tdoc', vals.tdoc);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals)) out[k] = cleanValue(k, v, { ...ctx, ...out });
    return collection === 'clientes' ? inferDocType(out) : out;
}