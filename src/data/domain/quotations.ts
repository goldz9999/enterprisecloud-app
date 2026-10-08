import { api, ApiError } from '../../lib/api';
import type { FlowItem, FlowRow } from '../../features/flowlist/types';
import { update } from '../store';
import type { DB } from '../types';
import {
    customerUuidByName,
    masterUuid,
    productUuidBySku,
    userUuidByName,
    warehouseIdByName,
} from './masters';
import { loadSaleOrders } from './salesOrders';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function toFlowRow(r: Raw): FlowRow {
    return {
        id: String(r.code || r.id),
        date: String(r.date || (r.createdAt || '').slice(0, 10) || ''),
        party: String(r.party || ''),
        partySub: String(r.partySub || ''),
        status: String(r.status || 'Borrador'),
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

function apply(d: DB, rows: FlowRow[]) {
    d.cotizaciones = rows;
}

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'La cotización ya no existe.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

let pending: Promise<void> | null = null;

export function loadQuotations(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const all: Raw[] = [];
                for (; ;) {
                    const res = await api<{ items: Raw[]; total: number }>(`/quotations?limit=200&offset=${all.length}`);
                    all.push(...(res.items || []));
                    if (!res.items?.length || all.length >= (res.total || 0)) break;
                }
                update(d => apply(d, all.map(toFlowRow)));
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) update(d => apply(d, []));
            }
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

export type QResult = { ok: true; row?: FlowRow; code?: string } | { ok: false; error: string };

function linesBody(items: FlowItem[]) {
    return items.map(i => ({
        productId: i.sku ? productUuidBySku(i.sku) : null,
        sku: i.sku || i.name,
        name: i.name,
        unit: i.unit,
        quantity: i.qty,
        unitPrice: i.price,
    }));
}

export async function saveQuotationRemote(
    data: Record<string, string>,
    items: FlowItem[],
    code?: string,
    customerLocalId?: number,
): Promise<QResult> {
    try {
        const customerId =
            (customerLocalId != null ? masterUuid('clientes', customerLocalId) : null) ||
            customerUuidByName(data.cliente);
        if (!customerId) return { ok: false, error: 'Cliente no encontrado en el servidor.' };
        const warehouseId = data.alm ? warehouseIdByName(data.alm) : null;
        const termsDays = Number(/(\d+)/.exec(data.cond || '')?.[1] ?? 0);
        const body = {
            customerId,
            warehouseId,
            sellerUserId: data.vendedor ? userUuidByName(data.vendedor) : null,
            validUntil: data.valida || null,
            paymentTermsDays: termsDays,
            lines: linesBody(items),
            status: 'DRAFT',
        };
        let rec: Raw;
        if (code) {
            rec = await api<Raw>(`/quotations/${encodeURIComponent(code)}`, { method: 'PATCH', body });
        } else {
            rec = await api<Raw>('/quotations', { method: 'POST', body });
        }
        const row = toFlowRow(rec);
        update(d => {
            const i = d.cotizaciones.findIndex(r => r.id === row.id);
            if (i >= 0) d.cotizaciones[i] = row;
            else d.cotizaciones.unshift(row);
        });
        return { ok: true, row, code: row.id };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

const STATUS_API: Record<string, string> = {
    Borrador: 'DRAFT',
    Enviada: 'SENT',
    Aprobada: 'APPROVED',
    Rechazada: 'REJECTED',
    Convertida: 'CONVERTED',
};

export async function setQuotationStatusRemote(code: string, statusUi: string, rejectedReason?: string): Promise<QResult> {
    try {
        const status = STATUS_API[statusUi] || statusUi;
        const rec = await api<Raw>(`/quotations/${encodeURIComponent(code)}/status`, {
            method: 'POST',
            body: { status, rejectedReason: rejectedReason ?? null },
        });
        const row = toFlowRow(rec);
        update(d => {
            const i = d.cotizaciones.findIndex(r => r.id === code);
            if (i >= 0) d.cotizaciones[i] = row;
        });
        return { ok: true, row };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function deleteQuotationRemote(code: string): Promise<QResult> {
    try {
        await api(`/quotations/${encodeURIComponent(code)}`, { method: 'DELETE' });
        update(d => {
            d.cotizaciones = d.cotizaciones.filter(r => r.id !== code);
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function convertQuotationRemote(code: string): Promise<QResult> {
    try {
        const res = await api<{ quotation: Raw; order: Raw }>(`/quotations/${encodeURIComponent(code)}/convert`, {
            method: 'POST',
        });
        const row = toFlowRow(res.quotation);
        update(d => {
            const i = d.cotizaciones.findIndex(r => r.id === code);
            if (i >= 0) d.cotizaciones[i] = row;
        });
        await loadSaleOrders();
        return { ok: true, row, code: String(res.order?.code || '') };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

/** Duplicar: crea una nueva cotización en borrador con los mismos datos. */
export async function duplicateQuotationRemote(_code: string, data: Record<string, string>, items: FlowItem[]): Promise<QResult> {
    return saveQuotationRemote(data, items);
}