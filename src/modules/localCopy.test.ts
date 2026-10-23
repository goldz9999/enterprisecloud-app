// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildEmptyDB } from '@/data/seed';
import type { Order } from '@/data/types';
import { EMPTY_COPY, fromCopy, mergeCopy } from './localCopy';

const order = (code: string, kind: Order['kind']) => ({ kind, code, createdAt: '', party: { name: 'X' }, lines: [], warehouse: '', done: 1, forms: {}, docs: {}, log: {}, seller: '', igvRate: 0.18 }) as unknown as Order;
const now = new Date(2026, 9, 23, 10);

describe('copia local', () => {
    it('copia solo lo que ya llegó del servidor y conserva lo demás', () => {
        const d = buildEmptyDB();
        d.records.productos = [{ _id: 1, sku: 'A' }];
        d.records.stock = [{ _id: 1, sku: 'A', stock: 5 }];
        const prev = { ...EMPTY_COPY, records: { stock: [{ _id: 1, sku: 'A', stock: 9 }] }, parts: { stock: 'antes' } };
        const next = mergeCopy(prev, d, p => p.id === 'productos', now);
        expect(next.records.productos).toEqual([{ _id: 1, sku: 'A' }]);
        expect(next.records.stock).toEqual([{ _id: 1, sku: 'A', stock: 9 }]); // stock no estaba listo: se conserva
        expect(next.parts.productos).toBe(now.toISOString());
    });
    it('una lista vacía del servidor (ya cargada) sí vacía la copia, p. ej. tras limpiar la base', () => {
        const d = buildEmptyDB();
        const prev = { ...EMPTY_COPY, records: { clientes: [{ _id: 1 }] }, parts: { clientes: 'antes' } };
        expect(mergeCopy(prev, d, p => p.id === 'clientes', now).records.clientes).toEqual([]);
    });
    it('órdenes: ventas y compras se copian por separado', () => {
        const d = buildEmptyDB();
        d.orders = [order('OV-2', 'venta')];
        const prev = { ...EMPTY_COPY, orders: [order('OV-1', 'venta'), order('OC-1', 'compra')], parts: { ventas: 'x', compras: 'x' } };
        const next = mergeCopy(prev, d, p => p.id === 'ventas', now);
        expect(next.orders.map(o => o.code).sort()).toEqual(['OC-1', 'OV-2']);
    });
    it('si nada cambió devuelve la misma copia (no reescribe el navegador)', () => {
        const d = buildEmptyDB();
        const once = mergeCopy(EMPTY_COPY, d, () => true, now);
        expect(mergeCopy(once, d, () => true, new Date())).toBe(once);
    });
    it('Gestión ve los datos de la copia, no los del sistema', () => {
        const real = buildEmptyDB();
        real.records.productos = [{ _id: 1, sku: 'SERVIDOR' }];
        const v = fromCopy(real, { ...EMPTY_COPY, records: { productos: [{ _id: 1, sku: 'COPIA' }] }, orders: [order('OV-9', 'venta')] });
        expect(v.records.productos[0].sku).toBe('COPIA');
        expect(v.orders.map(o => o.code)).toEqual(['OV-9']);
        expect(v.settings).toBe(real.settings);
    });
});