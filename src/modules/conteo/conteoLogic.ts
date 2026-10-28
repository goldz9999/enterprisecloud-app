export interface CountItem {
    /** Id del renglón en el servidor. */
    id: string;
    sku: string;
    name: string;
    unit: string;
    /** Stock del sistema al abrir el conteo. */
    system: number;
    /** Lo contado; null = aún no contado. */
    counted: number | null;
    cost: number;
}

export interface CountSummary {
    pending: number;
    withDiff: number;
    missingValue: number;
    surplusValue: number;
    net: number;
}

export interface Count {
    id: string;
    code: string;
    warehouse: string;
    openedAt: string;
    by: string;
    status: 'Abierto' | 'Cerrado';
    closedAt?: string;
    /** Cantidad de productos del conteo (la lista no trae los ítems). */
    itemCount: number;
    /** Resumen calculado por el servidor; en la pantalla de conteo se recalcula con `countSummary(items)` al ir contando. */
    summary: CountSummary;
    /** Solo viene al abrir un conteo; en la lista está vacío. */
    items: CountItem[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Pendientes, ítems con diferencia y su valor (faltante, sobrante y neto) al costo promedio. */
export function countSummary(c: Pick<Count, 'items'>): CountSummary {
    let pending = 0;
    let withDiff = 0;
    let missingValue = 0;
    let surplusValue = 0;
    for (const i of c.items) {
        if (i.counted == null) {
            pending++;
            continue;
        }
        const d = i.counted - i.system;
        if (d !== 0) withDiff++;
        if (d < 0) missingValue += -d * i.cost;
        if (d > 0) surplusValue += d * i.cost;
    }
    return { pending, withDiff, missingValue: r2(missingValue), surplusValue: r2(surplusValue), net: r2(surplusValue - missingValue) };
}