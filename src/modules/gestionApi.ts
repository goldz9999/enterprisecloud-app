import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/shared/lib/api';
import { useGestionTick } from '@/shared/lib/realtime';
import type { CommissionRules, Payout } from './comisiones/comisionesLogic';
import type { Count, CountItem } from './conteo/conteoLogic';
import type { Delivery } from './entregas/entregasLogic';
import type { Goal } from './metas/metasLogic';

/**
 * Datos propios de los módulos de Gestión: viven en el backend (Supabase), no en el navegador.
 * Las pantallas los leen con estos hooks (se vuelven a pedir solos cuando otra persona guarda algo, por tiempo real)
 * y los guardan con las funciones `*Api`. Los datos del sistema (ventas, stock, cuentas…) siguen viniendo del store principal.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const CODE_MESSAGES: Record<string, string> = {
    EMPTY_WAREHOUSE: 'No se pudo abrir el conteo: el almacén no tiene productos con stock registrado.',
    COUNT_NOT_OPEN: 'No se pudo guardar: el conteo ya está cerrado.',
    PENDING_ITEMS: 'No se pudo cerrar el conteo: aún hay productos por contar.',
    ORDER_NOT_DISPATCHED: 'No se pudo guardar: la venta aún no tiene guía de despacho o fue anulada.',
};

/** Mensaje en español para mostrar en un aviso cuando falla una lectura o un guardado. */
export function gestionError(e: unknown): string {
    if (!(e instanceof ApiError)) return 'No se pudo completar la acción. Inténtalo de nuevo.';
    if (e.code && CODE_MESSAGES[e.code]) return CODE_MESSAGES[e.code];
    if (e.status === 0) return e.message;
    if (e.status === 403) return 'Sin permiso para realizar esta acción.';
    if (e.status === 404) return 'El registro ya no existe.';
    if (e.status === 409) return 'No se pudo guardar: ya existe un registro igual.';
    if (e.status === 400) return `No se pudo guardar: ${e.message}`;
    if (e.status === 429) return 'Demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.';
    return `No se pudo completar la acción: ${e.message}`;
}

/**
 * Lee `path` del backend y lo deja en `data` (convertido con `map`). Con `path = null` no pide nada.
 * Se vuelve a pedir cuando cambia `path` o cuando llega un aviso de cambio de otra persona.
 * `initial` y `map` deben ser estables (constantes del módulo).
 */
export function useRemote<R, T>(path: string | null, initial: T, map: (raw: R) => T) {
    const tick = useGestionTick();
    const [state, setState] = useState({ data: initial, ready: false, error: '' });
    const seq = useRef(0);
    const mapRef = useRef(map);
    mapRef.current = map;
    const initialRef = useRef(initial);

    const reload = useCallback(async () => {
        const mine = ++seq.current;
        if (!path) {
            setState({ data: initialRef.current, ready: true, error: '' });
            return;
        }
        try {
            const raw = await api<R>(path);
            if (mine === seq.current) setState({ data: mapRef.current(raw), ready: true, error: '' });
        } catch (e) {
            if (mine === seq.current) setState(s => ({ ...s, error: gestionError(e) }));
        }
    }, [path]);

    useEffect(() => { void reload(); }, [reload, tick]);

    /** Cambia lo ya leído sin volver a pedirlo (p. ej. reflejar lo que se acaba de escribir en una casilla). */
    const setData = useCallback((fn: (d: T) => T) => setState(s => ({ ...s, data: fn(s.data) })), []);
    return { data: state.data, ready: state.ready, error: state.error, reload, setData };
}

// ───────────────────────── Metas ─────────────────────────
const NO_GOALS: Goal[] = [];
const toGoal = (r: Raw): Goal => ({ id: String(r.id), period: String(r.period), kind: r.kind, target: String(r.target), amount: Number(r.amount) });

export const useGoals = (period: string) =>
    useRemote<{ items: Raw[] }, Goal[]>(`/sales-goals?period=${period}`, NO_GOALS, r => r.items.map(toGoal));

export const goalsApi = {
    create: (g: Pick<Goal, 'period' | 'kind' | 'target' | 'amount'>) => api('/sales-goals', { method: 'POST', body: g }),
    update: (id: string, g: Pick<Goal, 'kind' | 'target' | 'amount'>) => api(`/sales-goals/${id}`, { method: 'PATCH', body: g }),
    remove: (id: string) => api(`/sales-goals/${id}`, { method: 'DELETE' }),
    /** Copia las metas de `from` que aún no existen en `to`. Devuelve cuántas creó. */
    copy: (fromPeriod: string, toPeriod: string) => api<{ created: number }>('/sales-goals/copy', { method: 'POST', body: { fromPeriod, toPeriod } }),
};

// ───────────────────────── Comisiones ─────────────────────────
export interface CommissionsData extends CommissionRules { paid: Payout[] }
const NO_COMMISSIONS: CommissionsData = { defaultPct: 0, bySeller: {}, paid: [] };
const toPayout = (p: Raw): Payout => ({ seller: String(p.seller), period: String(p.period), amount: Number(p.amount), at: String(p.paidAt), by: String(p.paidByName) });
const toCommissions = (r: Raw): CommissionsData => ({ defaultPct: Number(r.defaultPct) || 0, bySeller: r.bySeller ?? {}, paid: (r.payouts ?? []).map(toPayout) });

export const useCommissions = () => useRemote<Raw, CommissionsData>('/commissions', NO_COMMISSIONS, toCommissions);

export const commissionsApi = {
    setDefault: (pct: number) => api('/commissions/default-pct', { method: 'PUT', body: { pct } }),
    /** `pct = null` borra el % propio del vendedor (vuelve a usar el general). */
    setSeller: (seller: string, pct: number | null) => api('/commissions/seller-pct', { method: 'PUT', body: { seller, pct } }),
    pay: (seller: string, period: string, amount: number) => api('/commissions/payouts', { method: 'POST', body: { seller, period, amount } }),
};

// ───────────────────────── Inventario físico ─────────────────────────
const toItem = (i: Raw): CountItem => ({
    id: String(i.id), sku: String(i.sku), name: String(i.name), unit: String(i.unit),
    system: Number(i.systemQty) || 0, counted: i.countedQty == null ? null : Number(i.countedQty), cost: Number(i.unitCost) || 0,
});
export const toCount = (c: Raw): Count => ({
    id: String(c.id), code: String(c.code), warehouse: String(c.warehouse), openedAt: String(c.openedAt), by: String(c.openedBy),
    status: c.status === 'OPEN' ? 'Abierto' : 'Cerrado', closedAt: c.closedAt ?? undefined,
    itemCount: Number(c.summary?.itemCount) || 0,
    summary: {
        pending: Number(c.summary?.pending) || 0, withDiff: Number(c.summary?.withDiff) || 0,
        missingValue: Number(c.summary?.missingValue) || 0, surplusValue: Number(c.summary?.surplusValue) || 0, net: Number(c.summary?.net) || 0,
    },
    items: (c.items ?? []).map(toItem),
});

const NO_COUNTS: Count[] = [];
/** Lista de conteos (sin ítems; trae el resumen de cada uno). */
export const useCounts = () => useRemote<{ items: Raw[] }, Count[]>('/stock-counts', NO_COUNTS, r => r.items.map(toCount));
/** Un conteo con todos sus productos. */
export const useCount = (id: string | null) => useRemote<Raw, Count | null>(id ? `/stock-counts/${id}` : null, null, toCount);

export const countsApi = {
    create: async (warehouseName: string) => toCount(await api<Raw>('/stock-counts', { method: 'POST', body: { warehouseName } })),
    setCounted: (countId: string, itemId: string, counted: number | null) => api(`/stock-counts/${countId}/items/${itemId}`, { method: 'PATCH', body: { counted } }),
    close: async (countId: string) => toCount(await api<Raw>(`/stock-counts/${countId}/close`, { method: 'POST' })),
};

// ───────────────────────── Hoja de ruta ─────────────────────────
const NO_DELIVERIES: Record<string, Delivery> = {};
const toDelivery = (r: Raw): Delivery => ({
    status: r.status === 'DELIVERED' ? 'Entregado' : 'No entregado',
    receiver: r.receiver ?? undefined, reason: r.reason ?? undefined, note: r.note ?? undefined,
    at: String(r.confirmedAt), by: String(r.confirmedBy),
});

/** Confirmaciones de entrega de estas órdenes de venta (códigos), por código de orden. */
export const useDeliveries = (codes: string[]) =>
    useRemote<{ items: Raw[] }, Record<string, Delivery>>(
        codes.length ? `/deliveries?codes=${encodeURIComponent(codes.slice(0, 300).join(','))}` : null,
        NO_DELIVERIES,
        r => Object.fromEntries(r.items.map(i => [String(i.orderCode), toDelivery(i)])),
    );

export const deliveriesApi = {
    save: (code: string, d: Pick<Delivery, 'status' | 'receiver' | 'reason' | 'note'>) =>
        api(`/deliveries/${encodeURIComponent(code)}`, {
            method: 'PUT',
            body: { status: d.status === 'Entregado' ? 'DELIVERED' : 'NOT_DELIVERED', receiver: d.receiver ?? null, reason: d.reason ?? null, note: d.note ?? null },
        }),
    /** Vuelve la entrega a «Pendiente». */
    remove: (code: string) => api(`/deliveries/${encodeURIComponent(code)}`, { method: 'DELETE' }),
};

// ───────────────────────── Flujo de caja ─────────────────────────
const NO_CASHFLOW = { opening: null as number | null };
export const useCashflow = () =>
    useRemote<Raw, { opening: number | null }>('/cashflow/settings', NO_CASHFLOW, r => ({ opening: r.openingBalance == null ? null : Number(r.openingBalance) }));

export const cashflowApi = {
    /** `null` = usar Caja + Bancos del sistema. */
    setOpening: (openingBalance: number | null) => api('/cashflow/settings', { method: 'PUT', body: { openingBalance } }),
};