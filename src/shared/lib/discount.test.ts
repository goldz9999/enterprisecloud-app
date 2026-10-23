import { describe, expect, it } from 'vitest';
import { discountAmount, distributeDiscount } from './discount';

const line = (sku: string, qty: number, price: number) => ({ sku, name: sku, unit: 'und', qty, price });
const total = (ls: { qty: number; price: number }[]) => Math.round(ls.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;

describe('distributeDiscount', () => {
    it('reparte en proporción y cuadra al céntimo', () => {
        const ls = [line('A', 1, 6.9), line('B', 1, 18.5)];
        const out = distributeDiscount(ls, 2.54);
        expect(total(out)).toBe(22.86);
        // B pesa más del triple que A: se lleva más descuento
        expect(18.5 - out[1].price).toBeGreaterThan(6.9 - out[0].price);
    });
    it('con cantidades y céntimos difíciles el total sigue exacto', () => {
        const ls = [line('A', 3, 33.33), line('B', 7, 1.11), line('C', 2, 45.9)];
        for (const d of [0.01, 1, 10.07, 50]) {
            expect(total(distributeDiscount(ls, d))).toBe(Math.round((total(ls) - d) * 100) / 100);
        }
    });
    it('sin descuento no cambia nada y nunca descuenta más que el subtotal', () => {
        const ls = [line('A', 2, 10)];
        expect(distributeDiscount(ls, 0)).toBe(ls);
        expect(total(distributeDiscount(ls, 999))).toBe(0);
    });
});

describe('discountAmount', () => {
    it('soles o porcentaje', () => {
        expect(discountAmount(200, 'pct', 5)).toBe(10);
        expect(discountAmount(200, 'amount', 12.345)).toBe(12.35);
        expect(discountAmount(200, 'pct', -1)).toBe(0);
    });
});