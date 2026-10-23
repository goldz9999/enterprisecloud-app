import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/shared/lib/api';
import { formatMoney } from '@/shared/lib/format';
import { useRealtimeTick } from '@/shared/lib/realtime';
import { can } from '../permissions';
import { getSession, useSession } from '../session';
import type { Alert, Period } from './metrics';

export type SaleStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';

export interface DashboardData {
    period: string;
    sales: { total: number; previousTotal: number; count: number };
    purchases: { total: number; previousTotal: number; count: number; toReceive: number };
    grossProfit: { amount: number; margin: number };
    criticalStock: { count: number; items: { sku: string; name: string; warehouse: string; quantity: number; minimum: number }[] };
    receivables: { count: number; overdue: number; balance: number; overdueItems: { doc: string; customer: string; dueAt: string; daysOverdue: number; balance: number }[] };
    payables: { count: number; dueThisWeek: number; overdue: number; balance: number; dueItems: { doc: string; supplier: string; dueAt: string; daysOverdue: number; balance: number }[] };
    turnover: { times: number; days: number } | null;
    latestSales: { code: string; partyName: string; partyTaxId: string | null; total: number; status: SaleStatus; createdAt: string }[];
    salesTotalCount: number;
    userAlerts: { id: string; fullName: string; email: string; status: 'INVITED' | 'LOCKED'; roleName: string | null }[];
    /** Ventas facturadas por día y por categoría (rango en chartsRange). Pueden faltar si el backend es una versión anterior. */
    dailySales?: { date: string; total: number; count: number }[];
    salesByCategory?: { category: string; total: number; units: number }[];
    chartsRange?: { from: string | null; to: string | null };
}

const API_PERIOD: Record<Period, string> = { Hoy: 'today', Semana: 'week', Mes: 'month', Año: 'year' };
const TTL = 20_000;
const REFRESH = 60_000;

const cache = new Map<string, { at: number; data: DashboardData }>();
const inflight = new Map<string, Promise<DashboardData>>();
let cacheOwner: string | undefined;

/** Loads /dashboard for a period; the bell and the Dashboard share the result for a few seconds. */
export function loadDashboard(period: Period, force = false): Promise<DashboardData> {
    const token = getSession()?.token;
    if (token !== cacheOwner) {
        cache.clear();
        inflight.clear();
        cacheOwner = token;
    }
    const key = API_PERIOD[period];
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
    const pending = inflight.get(key);
    if (pending) return pending;
    const req = api<DashboardData>(`/dashboard?period=${key}`)
        .then(data => {
            cache.set(key, { at: Date.now(), data });
            return data;
        })
        .finally(() => inflight.delete(key));
    inflight.set(key, req);
    return req;
}

/** Dashboard data from the backend, refreshed every minute. `data` keeps the last good value while reloading. */
export function useDashboard(period: Period) {
    const session = useSession();
    const token = session?.token;
    const allowed = !!session && can(undefined, 'Dashboard', 'Ver');
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(allowed);
    const [error, setError] = useState('');

    const load = useCallback(
        (force = false) => {
            if (!allowed) return Promise.resolve();
            return loadDashboard(period, force)
                .then(d => { setData(d); setError(''); })
                .catch((e: unknown) => setError(e instanceof ApiError ? (e.status === 0 ? e.message : 'No se pudo cargar el resumen.') : 'No se pudo cargar el resumen.'))
                .finally(() => setLoading(false));
        },
        [period, allowed],
    );

    useEffect(() => {
        setLoading(true);
        void load();
        const id = setInterval(() => void load(true), REFRESH);
        return () => clearInterval(id);
    }, [load, token]);

    // Otra persona guardó algo: se actualiza sin esperar el minuto.
    const changes = useRealtimeTick();
    useEffect(() => {
        if (changes > 0) void load(true);
    }, [changes, load]);

    return { data, loading, error, reload: () => load(true) };
}

const overdueText = (days: number) => (days > 0 ? `Vencida hace ${days} día${days === 1 ? '' : 's'}` : days === 0 ? 'Vence hoy' : `Vence en ${-days} día${days === -1 ? '' : 's'}`);

/** System alerts (bell and Dashboard) built from the backend summary. */
export function alertsFrom(data: DashboardData | null): Alert[] {
    if (!data) return [];
    const out: Alert[] = [];
    for (const s of data.criticalStock.items) {
        const estado = s.quantity <= 0 ? 'Sin stock' : 'Bajo mínimo';
        out.push({ key: `stock:${s.sku}:${s.warehouse}:${estado}`, group: 'stock', title: s.name, sub: `${s.sku} · ${s.warehouse}`, value: `${s.quantity} / ${s.minimum}`, to: `/inventario/stock?q=${s.sku}`, qty: s.quantity, min: s.minimum });
    }
    for (const r of data.receivables.overdueItems)
        out.push({ key: `cxc:${r.doc}`, group: 'cxc', title: r.customer, sub: `${r.doc} · ${overdueText(r.daysOverdue)}`, value: formatMoney(r.balance), to: `/finanzas/cxc?q=${r.doc}` });
    for (const r of data.payables.dueItems)
        out.push({ key: `cxp:${r.doc}:${r.daysOverdue > 0 ? 'Vencida' : 'Vence esta semana'}`, group: 'cxp', title: r.supplier, sub: `${r.doc} · ${overdueText(r.daysOverdue)}`, value: formatMoney(r.balance), to: `/finanzas/cxp?q=${r.doc}` });
    for (const u of data.userAlerts) {
        const estado = u.status === 'LOCKED' ? 'bloqueado' : 'sin confirmar';
        out.push({ key: `user:${u.email}:${estado}`, group: 'user', title: `${u.fullName} · ${estado}`, sub: `Rol: ${u.roleName ?? '—'}`, value: '', to: `/admin/usuarios?q=${u.email}`, name: u.fullName });
    }
    return out;
}