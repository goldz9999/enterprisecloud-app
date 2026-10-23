import { describe, expect, it } from 'vitest';
import type { SaleFact } from '../sales';
import { goalProgress, ranking } from './metasLogic';

const fact = (seller: string, at: string, lines: { sku: string; qty: number; price: number }[]): SaleFact => ({
    code: seller + at, seller, client: 'X', at: new Date(at), paid: false,
    lines: lines.map(l => ({ ...l, name: l.sku, unit: 'u' })), base: lines.reduce((a, l) => a + l.qty * l.price, 0),
});
const facts = [
    fact('Ana', '2026-10-05T10:00:00', [{ sku: 'CEM-001', qty: 10, price: 30 }]), // 300
    fact('Ana', '2026-10-20T10:00:00', [{ sku: 'GAS-010', qty: 100, price: 1 }]), // 100
    fact('Luis', '2026-10-10T10:00:00', [{ sku: 'CEM-001', qty: 20, price: 30 }]), // 600
    fact('Luis', '2026-09-30T10:00:00', [{ sku: 'CEM-001', qty: 99, price: 30 }]), // otro mes
];
const catOf = (sku: string) => (sku.startsWith('CEM') ? 'Cementos' : 'Gasfitería');
const today = new Date(2026, 9, 23);

describe('metas', () => {
    it('avance por vendedor: solo ventas del mes, sin IGV, y ritmo esperado', () => {
        const p = goalProgress({ id: '1', period: '2026-10', kind: 'vendedor', target: 'Ana', amount: 800 }, facts, catOf, today);
        expect(p.actual).toBe(400);
        expect(p.pct).toBe(50);
        expect(p.expectedPct).toBeCloseTo(74.19, 1); // 23 de 31 días
        expect(p.behind).toBe(true);
    });
    it('avance por categoría', () => {
        const p = goalProgress({ id: '2', period: '2026-10', kind: 'categoria', target: 'Cementos', amount: 1000 }, facts, catOf, today);
        expect(p.actual).toBe(900);
        expect(p.behind).toBe(false);
    });
    it('un mes ya cerrado espera el 100 %', () => {
        const p = goalProgress({ id: '3', period: '2026-09', kind: 'vendedor', target: 'Luis', amount: 2970 }, facts, catOf, today);
        expect(p.expectedPct).toBe(100);
        expect(p.pct).toBe(100);
        expect(p.behind).toBe(false);
    });
    it('ranking de vendedores del mes', () => {
        expect(ranking(facts, '2026-10').map(r => [r.seller, r.total, r.count])).toEqual([['Luis', 600, 1], ['Ana', 400, 2]]);
    });
});