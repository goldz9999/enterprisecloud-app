import { describe, expect, it } from 'vitest';
import type { SaleFact } from '../sales';
import { commissions, payoutStatus } from './comisionesLogic';

const fact = (code: string, seller: string, at: string, base: number, paid: boolean): SaleFact => ({
    code, seller, client: 'Cliente ' + code, at: new Date(at), paid, base, lines: [{ sku: 'S', name: 'S', unit: 'u', qty: 1, price: base }],
});
const facts = [
    fact('OV-1', 'Ana', '2026-10-05T10:00:00', 1000, true),
    fact('OV-2', 'Ana', '2026-10-06T10:00:00', 500, false),
    fact('OV-3', 'Luis', '2026-10-07T10:00:00', 2000, true),
    fact('OV-4', 'Luis', '2026-09-07T10:00:00', 9000, true),
];

describe('commissions', () => {
    it('solo ventas cobradas del mes; % propio o el general', () => {
        const r = commissions(facts, '2026-10', { defaultPct: 2, bySeller: { Luis: 3 } });
        expect(r.lines.map(l => [l.code, l.pct, l.amount])).toEqual([['OV-1', 2, 20], ['OV-3', 3, 60]]);
        expect(r.bySeller).toEqual([{ seller: 'Luis', base: 2000, amount: 60, count: 1 }, { seller: 'Ana', base: 1000, amount: 20, count: 1 }]);
        expect(r.pendingBase).toBe(500);
    });
});

describe('payoutStatus', () => {
    const paid = [{ seller: 'Ana', period: '2026-10', amount: 20, at: 'x', by: 'y' }];
    it('pendiente, pagada o con diferencia', () => {
        expect(payoutStatus(paid, 'Luis', '2026-10', 60).state).toBe('Pendiente');
        expect(payoutStatus(paid, 'Ana', '2026-10', 20).state).toBe('Pagada');
        expect(payoutStatus(paid, 'Ana', '2026-10', 30)).toMatchObject({ state: 'Diferencia', diff: 10 });
    });
});