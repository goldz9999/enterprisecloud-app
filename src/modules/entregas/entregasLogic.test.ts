import { describe, expect, it } from 'vitest';
import type { Order } from '@/data/types';
import { routeSheet } from './entregasLogic';

const o = (code: string, done: number, ent: string, pla = 'F3Q-920', con = 'Wilber', tra = 'Movilidad propia'): Order => ({
    kind: 'venta', code, createdAt: '2026-10-20T10:00:00', party: { name: 'Cliente ' + code, ruc: '', address: 'Av. 1' } as Order['party'], warehouse: 'Central', done,
    forms: { 0: { ent, pla, con, tra } }, docs: { 2: 'Guía T001-00001' }, log: {}, seller: 'Ana', igvRate: 0.18,
    lines: [{ sku: 'CEM-001', name: 'Cemento', unit: 'Bolsa', qty: 10, price: 30 }],
});

describe('routeSheet', () => {
    const orders = [
        o('OV-1', 3, '2026-10-24'),
        o('OV-2', 4, '2026-10-24', 'B7K-415', 'Carlos'),
        o('OV-3', 2, '2026-10-24'), // aún sin despacho
        o('OV-4', 4, '2026-10-24', '', '', 'Retira el cliente'),
        o('OV-5', 4, '2026-10-25'), // otro día
    ];
    it('solo ventas despachadas de ese día, por vehículo; las que recoge el cliente aparte', () => {
        const r = routeSheet(orders, '2026-10-24', {});
        expect(r.routes.map(x => [x.vehicle, x.driver, x.stops.map(s => s.code)])).toEqual([['B7K-415', 'Carlos', ['OV-2']], ['F3Q-920', 'Wilber', ['OV-1']]]);
        expect(r.pickups.map(s => s.code)).toEqual(['OV-4']);
        expect(r.routes[1].stops[0]).toMatchObject({ guide: 'T001-00001', items: '10 Bolsa Cemento', address: 'Av. 1' });
        expect(r.total).toBe(3);
    });
    it('aplica el estado guardado y cuenta entregas', () => {
        const r = routeSheet(orders, '2026-10-24', { 'OV-1': { status: 'Entregado', receiver: 'Juan', at: 'x', by: 'y' }, 'OV-4': { status: 'No entregado', reason: 'Cliente ausente', at: 'x', by: 'y' } });
        expect(r.routes[1].stops[0].status).toBe('Entregado');
        expect(r.routes[0].stops[0].status).toBe('Pendiente');
        expect([r.delivered, r.failed]).toEqual([1, 1]);
    });
});