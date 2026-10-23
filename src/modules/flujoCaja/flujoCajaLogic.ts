import { addDays, isoDate, parseDate } from '@/shared/lib/dates';

type R = Record<string, unknown>;
export interface CashWeek {
    /** Lunes de la semana (YYYY-MM-DD). */
    start: string;
    inflow: number;
    outflow: number;
    /** Saldo proyectado al cierre de la semana. */
    balance: number;
    /** Documentos que vencen esa semana. */
    docs: { kind: 'cobro' | 'pago'; who: string; doc: string; due: string; amount: number }[];
}

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d: Date) => addDays(dayOf(d), -((d.getDay() + 6) % 7));
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Proyección de caja por semana (lunes a domingo) desde la semana actual:
 * entra el saldo de las cuentas por cobrar y sale el de las cuentas por pagar, según su fecha de vencimiento.
 * Lo ya vencido se informa aparte (no se sabe cuándo se cobrará o pagará).
 */
export function projectCash({ cxc, cxp, opening, today, weeks }: { cxc: R[]; cxp: R[]; opening: number; today: Date; weeks: number }) {
    const first = mondayOf(today);
    const start = dayOf(today);
    const out: CashWeek[] = Array.from({ length: weeks }, (_, i) => ({ start: isoDate(addDays(first, i * 7)), inflow: 0, outflow: 0, balance: 0, docs: [] }));
    let overdueIn = 0;
    let overdueOut = 0;
    const place = (rows: R[], kind: 'cobro' | 'pago') => {
        for (const r of rows) {
            const saldo = Number(r.saldo) || 0;
            const due = parseDate(String(r.vence ?? ''));
            if (saldo <= 0 || !due) continue;
            const day = dayOf(due);
            if (day < start) {
                if (kind === 'cobro') overdueIn += saldo;
                else overdueOut += saldo;
                continue;
            }
            const i = Math.floor(Math.round((day.getTime() - first.getTime()) / 86400000) / 7);
            if (i < 0 || i >= weeks) continue;
            if (kind === 'cobro') out[i].inflow += saldo;
            else out[i].outflow += saldo;
            out[i].docs.push({ kind, who: String(kind === 'cobro' ? r.cliente : r.prov), doc: String(r.doc ?? r.ref ?? ''), due: isoDate(day), amount: saldo });
        }
    };
    place(cxc, 'cobro');
    place(cxp, 'pago');
    let bal = opening;
    for (const w of out) {
        w.inflow = r2(w.inflow);
        w.outflow = r2(w.outflow);
        bal = r2(bal + w.inflow - w.outflow);
        w.balance = bal;
        w.docs.sort((a, b) => a.due.localeCompare(b.due));
    }
    return { weeks: out, overdueIn: r2(overdueIn), overdueOut: r2(overdueOut) };
}

/** Saldo actual de Caja más Bancos: suma de montos con signo, igual que los KPI de esas pantallas. */
export function currentBalance(caja: R[], bancos: R[]): number {
    const sum = (rows: R[]) => rows.reduce((a, r) => a + (Number(r.monto) || 0), 0);
    return r2(sum(caja) + sum(bancos));
}