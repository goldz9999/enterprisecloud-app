type R = Record<string, unknown>;

export interface CountItem {
    sku: string;
    name: string;
    unit: string;
    /** Stock del sistema al abrir el conteo. */
    system: number;
    /** Lo contado; null = aún no contado. */
    counted: number | null;
    cost: number;
}

export interface Count {
    id: string;
    code: string;
    warehouse: string;
    openedAt: string;
    by: string;
    status: 'Abierto' | 'Cerrado';
    closedAt?: string;
    items: CountItem[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Abre un conteo con la «foto» del stock del almacén en este momento. */
export function openCount(stock: R[], warehouse: string, product: (sku: string) => { cost: number; unit: string }, by: string, seq: number, now: Date, id: string): Count {
    return {
        id,
        code: `CF-${now.getFullYear()}-${String(seq).padStart(4, '0')}`,
        warehouse,
        openedAt: now.toISOString(),
        by,
        status: 'Abierto',
        items: stock
            .filter(s => s.alm === warehouse)
            .map(s => ({ sku: String(s.sku), name: String(s.prod), unit: product(String(s.sku)).unit, system: Number(s.stock) || 0, counted: null, cost: product(String(s.sku)).cost }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}

/** Pendientes, ítems con diferencia y su valor (faltante, sobrante y neto) al costo promedio. */
export function countSummary(c: Pick<Count, 'items'>) {
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

/** Siguiente correlativo del año para el código CF-AAAA-NNNN. */
export function nextSeq(counts: Count[], year: number): number {
    const prefix = `CF-${year}-`;
    return counts.filter(c => c.code.startsWith(prefix)).reduce((a, c) => Math.max(a, Number(c.code.slice(prefix.length)) || 0), 0) + 1;
}