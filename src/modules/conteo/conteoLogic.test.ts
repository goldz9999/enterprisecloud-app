import { describe, expect, it } from 'vitest';
import { countSummary, type CountItem } from './conteoLogic';

const item = (sku: string, system: number, cost: number, counted: number | null = null): CountItem => ({ id: sku, sku, name: 'Prod ' + sku, unit: 'Unidad', system, counted, cost });

describe('conteo', () => {
    it('sin contar nada, todo queda pendiente', () => {
        expect(countSummary({ items: [item('A', 10, 2), item('B', 5, 10)] })).toEqual({ pending: 2, withDiff: 0, missingValue: 0, surplusValue: 0, net: 0 });
    });
    it('resume pendientes, diferencias y su valor', () => {
        // A: faltan 2 × S/ 2 · B: sobra 1 × S/ 10 · C: coincide
        const items = [item('A', 10, 2, 8), item('B', 5, 10, 6), item('C', 3, 1, 3)];
        expect(countSummary({ items })).toEqual({ pending: 0, withDiff: 2, missingValue: 4, surplusValue: 10, net: 6 });
    });
    it('un producto sin contar no cuenta como diferencia', () => {
        expect(countSummary({ items: [item('A', 10, 2, 8), item('B', 5, 10)] })).toEqual({ pending: 1, withDiff: 1, missingValue: 4, surplusValue: 0, net: -4 });
    });
});