import { api, ApiError } from '../../lib/api';
import { update } from '../store';
import type { DB, Order, OrderLine, OrderParty } from '../types';
import {
    customerUuidByName,
    masterUuid,
    productUuidBySku,
    userUuidByName,
    warehouseIdByName,
} from './masters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function toOrder(r: Raw): Order {
    const forms: Order['forms'] = {};
    const docs: Order['docs'] = {};
    const log: Order['log'] = {};
    const rawForms = r.forms || {};
    const rawDocs = r.docs || {};
    const rawLog = r.log || {};
    for (const k of Object.keys({ ...rawForms, ...rawDocs, ...rawLog })) {
        const n = Number(k);
        if (!Number.isFinite(n)) continue;
        if (rawForms[k]) forms[n] = rawForms[k];
        if (rawDocs[k] != null) docs[n] = String(rawDocs[k]);
        if (rawLog[k]) log[n] = { who: String(rawLog[k].who || ''), at: String(rawLog[k].at || '') };
    }
    const party = r.party || {};
    return {
        kind: 'venta',
        code: String(r.code),
        createdAt: String(r.createdAt || r.created_at || new Date().toISOString()),
        party: {
            code: String(party.code || ''),
            name: String(party.name || ''),
            ruc: String(party.ruc || ''),
            contact: String(party.contact || ''),
            terms: String(party.terms || 'Contado'),
            address: String(party.address || ''),
            email: String(party.email || ''),
        },
        lines: (r.lines || []).map((l: Raw) => ({
            sku: String(l.sku || ''),
            name: String(l.name || ''),
            unit: String(l.unit || ''),
            qty: Number(l.qty) || 0,
            price: Number(l.price) || 0,
        })),
        warehouse: String(r.warehouse || ''),
        done: Number(r.done) || 1,
        forms,
        docs,
        log,
        origin: r.origin ? String(r.origin) : undefined,
        seller: String(r.seller || ''),
        igvRate: Number(r.igvRate ?? r.tax_rate ?? 0.18),
        cancelled: Boolean(r.cancelled || r.is_cancelled),
    };
}

function applyOrders(d: DB, items: Order[]) {
    // Conserva órdenes de compra locales; reemplaza solo las de venta.
    const purchases = d.orders.filter(o => o.kind === 'compra');
    d.orders = [...items, ...purchases];
}

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'La orden ya no existe en el servidor.';
        if (e.status === 409) return 'Conflicto: la orden ya fue modificada o el código está en uso.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

let pending: Promise<void> | null = null;

/** Descarga las órdenes de venta del backend y actualiza el espejo local. */
export function loadSaleOrders(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const all: Raw[] = [];
                for (; ;) {
                    const res = await api<{ items: Raw[]; total: number }>(`/sales-orders?limit=200&offset=${all.length}`);
                    all.push(...(res.items || []));
                    if (!res.items?.length || all.length >= (res.total || 0)) break;
                }
                const orders = all.map(toOrder);
                update(d => applyOrders(d, orders));
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) {
                    update(d => applyOrders(d, []));
                }
                // Servidor caído: se conservan las que ya había.
            }
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

export type OrderResult = { ok: true; order: Order } | { ok: false; error: string };

export async function createSaleOrderRemote(input: {
    party: OrderParty;
    lines: OrderLine[];
    warehouse: string;
    seller?: string;
    customerLocalId?: number;
}): Promise<OrderResult> {
    try {
        const customerId =
            (input.customerLocalId != null ? masterUuid('clientes', input.customerLocalId) : null) ||
            customerUuidByName(input.party.name);
        if (!customerId) return { ok: false, error: 'No se pudo identificar el cliente en el servidor. Recarga maestros.' };

        const warehouseId = warehouseIdByName(input.warehouse);
        if (!warehouseId) return { ok: false, error: 'No se pudo identificar el almacén en el servidor.' };

        const termsDays = Number(/(\d+)/.exec(input.party.terms || '')?.[1] ?? 0);
        const body = {
            customerId,
            warehouseId,
            sellerUserId: input.seller ? userUuidByName(input.seller) : null,
            paymentTermsDays: termsDays,
            partyName: input.party.name,
            partyTaxId: input.party.ruc || null,
            partyAddress: input.party.address || null,
            partyContact: input.party.contact || null,
            partyEmail: input.party.email || null,
            origin: 'Venta directa',
            lines: input.lines.map(l => ({
                productId: productUuidBySku(l.sku),
                sku: l.sku,
                name: l.name,
                unit: l.unit,
                quantity: l.qty,
                unitPrice: l.price,
            })),
        };
        const rec = await api<Raw>('/sales-orders', { method: 'POST', body });
        const order = toOrder(rec);
        update(d => {
            d.orders = [order, ...d.orders.filter(o => !(o.kind === 'venta' && o.code === order.code))];
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function completeSaleStepRemote(
    code: string,
    values: Record<string, string>,
    generatedReference?: string,
): Promise<OrderResult> {
    try {
        const rec = await api<Raw>(`/sales-orders/${encodeURIComponent(code)}/complete-step`, {
            method: 'POST',
            body: { values, generatedReference: generatedReference ?? null },
        });
        const order = toOrder(rec);
        update(d => {
            const i = d.orders.findIndex(o => o.code === code && o.kind === 'venta');
            if (i >= 0) d.orders[i] = order;
            else d.orders.unshift(order);
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function cancelSaleOrderRemote(code: string, reason?: string): Promise<OrderResult> {
    try {
        const rec = await api<Raw>(`/sales-orders/${encodeURIComponent(code)}/cancel`, {
            method: 'POST',
            body: { reason: reason ?? null },
        });
        const order = toOrder(rec);
        update(d => {
            const i = d.orders.findIndex(o => o.code === code && o.kind === 'venta');
            if (i >= 0) d.orders[i] = order;
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}