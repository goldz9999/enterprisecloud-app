import { describe, expect, it } from 'vitest';
import { currentBalance, projectCash } from './flujoCajaLogic';

const today = new Date(2026, 9, 23); // viernes 23 oct 2026 → semana del lunes 19
const cxc = [
    { cliente: 'A', doc: 'F001-1', saldo: 1000, vence: '25 oct 2026' },
    { cliente: 'B', doc: 'F001-2', saldo: 500, vence: '20 oct 2026' },
    { cliente: 'C', doc: 'F001-3', saldo: 0, vence: '26 oct 2026' },
];
const cxp = [{ prov: 'P', doc: 'FP-9', saldo: 300, vence: '03 nov 2026' }];

describe('projectCash', () => {
    it('separa lo vencido y agrupa el resto por semana (lunes a domingo)', () => {
        const r = projectCash({ cxc, cxp, opening: 2000, today, weeks: 4 });
        expect(r.overdueIn).toBe(500);
        expect(r.overdueOut).toBe(0);
        expect(r.weeks[0]).toMatchObject({ start: '2026-10-19', inflow: 1000, outflow: 0, balance: 3000 });
        expect(r.weeks[1]).toMatchObject({ start: '2026-10-26', inflow: 0, outflow: 0, balance: 3000 });
        expect(r.weeks[2]).toMatchObject({ start: '2026-11-02', inflow: 0, outflow: 300, balance: 2700 });
        expect(r.weeks[2].docs).toEqual([{ kind: 'pago', who: 'P', doc: 'FP-9', due: '2026-11-03', amount: 300 }]);
    });
    it('ignora saldos en cero y lo que cae fuera del horizonte', () => {
        const r = projectCash({ cxc, cxp, opening: 0, today, weeks: 1 });
        expect(r.weeks).toHaveLength(1);
        expect(r.weeks[0].inflow).toBe(1000);
    });
});

describe('currentBalance', () => {
    it('suma caja y bancos con signo', () => {
        expect(currentBalance([{ monto: 500 }, { monto: -120.5 }], [{ monto: 1000 }])).toBe(1379.5);
    });
});