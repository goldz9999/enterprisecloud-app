import { liveSales, recognizedAt } from '@/data/domain/metrics';
import { orderSubtotal, saleListStatus } from '@/data/domain/orders';
import type { DB } from '@/data/types';
import type { SaleFact } from './sales';

/** Ventas reconocidas del sistema (liveSales / recognizedAt, igual que Dashboard y Reportes). */
export function saleFacts(d: DB): SaleFact[] {
    return liveSales(d).map(o => ({
        code: o.code,
        seller: o.seller || '—',
        client: o.party?.name ?? '',
        at: recognizedAt(d, o),
        lines: o.lines,
        base: Math.round(orderSubtotal(o) * 100) / 100,
        paid: saleListStatus(d, o) === 'Pagado',
    }));
}

/** Vendedores: usuarios activos más quien figure como vendedor en alguna venta. */
export function sellers(d: DB, facts: SaleFact[] = []): string[] {
    const fromUsers = d.records.usuarios.filter(u => u.estado !== 'Inactivo').map(u => String(u.nombre)).filter(Boolean);
    return [...new Set([...fromUsers, ...facts.map(f => f.seller).filter(s => s && s !== '—')])].sort((a, b) => a.localeCompare(b));
}

/** Mes actual «YYYY-MM» y los 11 anteriores, para los selectores de periodo. */
export function lastMonths(n = 12, now = new Date()): string[] {
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
}