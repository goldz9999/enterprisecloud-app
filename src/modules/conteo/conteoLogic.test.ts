import { describe, expect, it } from 'vitest';
import { countSummary, nextSeq, openCount } from './conteoLogic';

const stock = [
    { sku: 'B', prod: 'Prod B', alm: 'Central', stock: 5 },
    { sku: 'A', prod: 'Prod A', alm: 'Central', stock: 10 },
    { sku: 'C', prod: 'Prod C', alm: 'Comas', stock: 7 },
];
const product = (sku: string) => ({ cost: ({ A: 2, B: 10 } as Record<string, number>)[sku] ?? 0, unit: 'Unidad' });
const now = new Date(2026, 9, 23);

describe('conteo', () => {
    it('abre con la foto del stock del almacén, ordenada por nombre', () => {
        const c = openCount(stock, 'Central', product, 'Miguel', 1, now, 'x');
        expect(c.code).toBe('CF-2026-0001');
        expect(c.items.map(i => [i.sku, i.system, i.counted])).toEqual([['A', 10, null], ['B', 5, null]]);
    });
    it('resume pendientes, diferencias y su valor', () => {
        const c = openCount(stock, 'Central', product, 'Miguel', 1, now, 'x');
        expect(countSummary(c).pending).toBe(2);
        c.items[0].counted = 8; // faltan 2 × S/ 2
        c.items[1].counted = 6; // sobra 1 × S/ 10
        expect(countSummary(c)).toEqual({ pending: 0, withDiff: 2, missingValue: 4, surplusValue: 10, net: 6 });
    });
    it('correlativo por año', () => {
        const a = openCount(stock, 'Central', product, 'M', 7, now, 'a');
        expect(nextSeq([a], 2026)).toBe(8);
        expect(nextSeq([a], 2027)).toBe(1);
    });
});