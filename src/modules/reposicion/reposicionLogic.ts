type R = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;

export interface RestockRow {
    sku: string;
    name: string;
    warehouse: string;
    /** Disponible = stock físico − reservado por ventas confirmadas. */
    available: number;
    min: number;
    suggested: number;
    unit: string;
    supplier: string;
    cost: number;
    amount: number;
}

/**
 * Productos bajo su stock mínimo (por almacén), con la cantidad sugerida para llegar a `factor` × mínimo
 * y el proveedor activo más barato de «Precios por proveedor». Es una sugerencia: no crea compras sola.
 */
export function suggestRestock(stock: R[], prices: R[], units: Record<string, string> = {}, factor = 2): RestockRow[] {
    return stock
        .map(s => ({ s, available: n(s.stock) - n(s.res), min: n(s.min) }))
        .filter(x => x.min > 0 && x.available < x.min)
        .map(({ s, available, min }) => {
            const sku = String(s.sku);
            const best = prices
                // En el sistema la fila trae `sku` (código) y `prod` (nombre); se acepta cualquiera de los dos.
                .filter(p => (String(p.sku ?? '') === sku || String(p.prod) === sku || String(p.prod) === String(s.prod)) && p.estado !== 'Inactivo')
                .sort((a, b) => n(a.costo) - n(b.costo))[0];
            const suggested = Math.ceil(min * factor - available);
            const cost = best ? n(best.costo) : 0;
            return {
                sku, name: String(s.prod), warehouse: String(s.alm), available, min, suggested, unit: units[sku] ?? 'und.',
                supplier: best ? String(best.prov) : '', cost, amount: Math.round(suggested * cost * 100) / 100,
            };
        })
        // Lo más urgente primero: menor proporción disponible / mínimo.
        .sort((a, b) => a.available / a.min - b.available / b.min || a.name.localeCompare(b.name));
}