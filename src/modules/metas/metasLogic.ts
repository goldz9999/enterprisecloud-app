import { inPeriod, type SaleFact } from '../sales';

export interface Goal {
    id: string;
    /** Mes «YYYY-MM». */
    period: string;
    kind: 'vendedor' | 'categoria';
    /** Nombre del vendedor o de la categoría. */
    target: string;
    /** Meta en soles, sin IGV. */
    amount: number;
}

export interface GoalProgress {
    actual: number;
    /** % de la meta alcanzado. */
    pct: number;
    /** % del mes transcurrido (lo que «debería» llevar si vendiera parejo). */
    expectedPct: number;
    /** Va más de 10 puntos por debajo del ritmo esperado. */
    behind: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Avance real de una meta: ventas facturadas del mes, sin IGV (con el descuento ya aplicado a los precios). */
export function goalProgress(g: Goal, facts: SaleFact[], categoryOf: (sku: string) => string, today: Date): GoalProgress {
    let actual = 0;
    for (const f of inPeriod(facts, g.period)) {
        for (const l of f.lines) {
            if (g.kind === 'vendedor' ? f.seller === g.target : categoryOf(l.sku) === g.target) actual += l.qty * l.price;
        }
    }
    actual = r2(actual);
    const [y, m] = g.period.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);
    const elapsed = today < monthStart ? 0 : today > monthEnd ? days : today.getDate();
    const pct = g.amount > 0 ? r2((actual / g.amount) * 100) : 0;
    const expectedPct = r2((elapsed / days) * 100);
    return { actual, pct, expectedPct, behind: pct < 100 && pct < expectedPct - 10 };
}

/** Ranking de vendedores por venta facturada del mes (sin IGV). */
export function ranking(facts: SaleFact[], period: string) {
    const by = new Map<string, { seller: string; total: number; count: number }>();
    for (const f of inPeriod(facts, period)) {
        const r = by.get(f.seller) ?? { seller: f.seller, total: 0, count: 0 };
        r.total = r2(r.total + f.base);
        r.count++;
        by.set(f.seller, r);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
}