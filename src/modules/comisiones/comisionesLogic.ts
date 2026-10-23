import { inPeriod, type SaleFact } from '../sales';

export interface CommissionRules {
    /** % general para quien no tenga uno propio. */
    defaultPct: number;
    /** % propio por vendedor. */
    bySeller: Record<string, number>;
}

export interface Payout {
    seller: string;
    period: string;
    amount: number;
    at: string;
    by: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Comisión de cada venta cobrada del mes (base: subtotal sin IGV) y el total por vendedor. */
export function commissions(facts: SaleFact[], period: string, rules: CommissionRules) {
    const lines = inPeriod(facts, period)
        .filter(f => f.paid)
        .map(f => {
            const pct = rules.bySeller[f.seller] ?? rules.defaultPct;
            return { code: f.code, seller: f.seller, client: f.client, base: f.base, pct, amount: r2((f.base * pct) / 100) };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
    const map = new Map<string, { seller: string; base: number; amount: number; count: number }>();
    for (const l of lines) {
        const s = map.get(l.seller) ?? { seller: l.seller, base: 0, amount: 0, count: 0 };
        s.base = r2(s.base + l.base);
        s.amount = r2(s.amount + l.amount);
        s.count++;
        map.set(l.seller, s);
    }
    // Ventas facturadas del mes que aún no se cobran: generarán comisión cuando se cobren.
    const pending = inPeriod(facts, period).filter(f => !f.paid);
    return { lines, bySeller: [...map.values()].sort((a, b) => b.amount - a.amount), pendingBase: r2(pending.reduce((a, f) => a + f.base, 0)) };
}

/** Lo ya pagado a un vendedor en un mes y si difiere de lo calculado ahora (p. ej. se cobraron más ventas después). */
export function payoutStatus(paid: Payout[], seller: string, period: string, amountNow: number) {
    const p = paid.find(x => x.seller === seller && x.period === period);
    if (!p) return { state: 'Pendiente' as const, diff: amountNow };
    const diff = r2(amountNow - p.amount);
    return { state: Math.abs(diff) < 0.005 ? ('Pagada' as const) : ('Diferencia' as const), diff, payout: p };
}