import { api, ApiError } from '../../lib/api';
import type { FlowItem, FlowRow } from '../../features/flowlist/types';
import { update } from '../store';
import type { DB } from '../types';
import { productUuidBySku, supplierUuidByName, warehouseIdByName } from './masters';
import { loadPurchaseOrders } from './purchaseOrders';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const PRIORITY_API: Record<string, string> = { Alta: 'HIGH', Media: 'MEDIUM', Baja: 'LOW' };
const STATUS_API: Record<string, string> = {
    Pendiente: 'PENDING', Aprobada: 'APPROVED', Rechazada: 'REJECTED', Atendida: 'ATTENDED',
};

function toFlowRow(r: Raw): FlowRow {
    return {
        id: String(r.code || r.id),
        date: String(r.date || (r.createdAt || '').slice(0, 10) || ''),
        party: String(r.party || ''),
        partySub: String(r.partySub || ''),
        status: String(r.status || 'Pendiente'),
        items: (r.items || []).map((i: Raw) => ({
            sku: i.sku ? String(i.sku) : undefined,
            name: String(i.name || ''),
            qty: Number(i.qty) || 0,
            unit: String(i.unit || ''),
            price: Number(i.price) || 0,
        })),
        facts: (r.facts || []).map((f: Raw) => ({ k: String(f.k), v: String(f.v) })),
        data: r.data ? { ...r.data } : undefined,
        order: r.order ? String(r.order) : undefined,
    };
}

function apply(d: DB, rows: FlowRow[]) { d.solicitudes = rows; }

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'La solicitud ya no existe.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

let pending: Promise<void> | null = null;

export function loadPurchaseRequests(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const all: Raw[] = [];
                for (; ;) {
                    const res = await api<{ items: Raw[]; total: number }>(`/purchase-requests?limit=200&offset=${all.length}`);
                    all.push(...(res.items || []));
                    if (!res.items?.length || all.length >= (res.total || 0)) break;
                }
                update(d => apply(d, all.map(toFlowRow)));
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) update(d => apply(d, []));
            }
        })().finally(() => { pending = null; });
    }
    return pending;
}

export type RResult = { ok: true; row?: FlowRow; code?: string } | { ok: false; error: string };

function linesBody(items: FlowItem[]) {
    return items.map(i => ({
        productId: i.sku ? productUuidBySku(i.sku) : null,
        sku: i.sku || null,
        name: i.name,
        unit: i.unit,
        quantity: i.qty,
        estimatedUnitCost: i.price,
    }));
}

export async function savePurchaseRequestRemote(
    data: Record<string, string>,
    items: FlowItem[],
    code?: string,
): Promise<RResult> {
    try {
        const body = {
            requestingArea: data.area || 'General',
            reason: data.motivo || 'Solicitud de compra',
            priority: PRIORITY_API[data.prioridad] || 'MEDIUM',
            requiredBy: data.req || null,
            warehouseId: data.alm ? warehouseIdByName(data.alm) : null,
            suggestedSupplierId: data.prov ? supplierUuidByName(data.prov) : null,
            lines: linesBody(items),
        };
        let rec: Raw;
        if (code) {
            rec = await api<Raw>(`/purchase-requests/${encodeURIComponent(code)}`, { method: 'PATCH', body });
        } else {
            rec = await api<Raw>('/purchase-requests', { method: 'POST', body });
        }
        const row = toFlowRow(rec);
        update(d => {
            const i = d.solicitudes.findIndex(r => r.id === row.id);
            if (i >= 0) d.solicitudes[i] = row;
            else d.solicitudes.unshift(row);
        });
        return { ok: true, row, code: row.id };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function setPurchaseRequestStatusRemote(code: string, statusUi: string, reason?: string): Promise<RResult> {
    try {
        const status = STATUS_API[statusUi] || statusUi;
        const rec = await api<Raw>(`/purchase-requests/${encodeURIComponent(code)}/status`, {
            method: 'POST',
            body: { status, rejectionReason: reason ?? null },
        });
        const row = toFlowRow(rec);
        update(d => {
            const i = d.solicitudes.findIndex(r => r.id === code);
            if (i >= 0) d.solicitudes[i] = row;
        });
        return { ok: true, row };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function deletePurchaseRequestRemote(code: string): Promise<RResult> {
    try {
        await api(`/purchase-requests/${encodeURIComponent(code)}`, { method: 'DELETE' });
        update(d => { d.solicitudes = d.solicitudes.filter(r => r.id !== code); });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function convertPurchaseRequestRemote(
    code: string,
    supplierName: string,
    warehouseName?: string,
): Promise<RResult> {
    try {
        const supplierId = supplierUuidByName(supplierName);
        if (!supplierId) return { ok: false, error: 'Selecciona un proveedor registrado en Mantenimiento.' };
        const body: Record<string, unknown> = { supplierId };
        if (warehouseName) body.warehouseId = warehouseIdByName(warehouseName);
        const res = await api<{ request: Raw; order: Raw }>(
            `/purchase-requests/${encodeURIComponent(code)}/convert`,
            { method: 'POST', body },
        );
        const row = toFlowRow(res.request);
        update(d => {
            const i = d.solicitudes.findIndex(r => r.id === code);
            if (i >= 0) d.solicitudes[i] = row;
        });
        await loadPurchaseOrders();
        return { ok: true, row, code: String(res.order?.code || '') };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function duplicatePurchaseRequestRemote(
    data: Record<string, string>,
    items: FlowItem[],
): Promise<RResult> {
    return savePurchaseRequestRemote(data, items);
}