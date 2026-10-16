import { api, ApiError } from '../../lib/api';
import { update } from '../store';
import type { DB, Order, OrderLine, OrderParty } from '../types';
import { masterUuid, productUuidBySku, supplierUuidByName, userUuidByName, warehouseIdByName } from './masters';

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
        kind: 'compra',
        id: r.id ? String(r.id) : undefined,
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
        igvRate: Number(r.igvRate ?? 0.18),
        cancelled: Boolean(r.cancelled),
    };
}

function applyOrders(d: DB, items: Order[]) {
    const sales = d.orders.filter(o => o.kind === 'venta');
    d.orders = [...sales, ...items];
}

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'La orden ya no existe en el servidor.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

let pending: Promise<void> | null = null;

export function loadPurchaseOrders(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const all: Raw[] = [];
                for (; ;) {
                    const res = await api<{ items: Raw[]; total: number }>(`/purchase-orders?limit=200&offset=${all.length}`);
                    all.push(...(res.items || []));
                    if (!res.items?.length || all.length >= (res.total || 0)) break;
                }
                update(d => applyOrders(d, all.map(toOrder)));
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) update(d => applyOrders(d, []));
            }
        })().finally(() => { pending = null; });
    }
    return pending;
}

export type OrderResult = { ok: true; order: Order } | { ok: false; error: string };

export async function createPurchaseOrderRemote(input: {
    party: OrderParty;
    lines: OrderLine[];
    warehouse: string;
    seller?: string;
    supplierLocalId?: number;
}): Promise<OrderResult> {
    try {
        const supplierId =
            (input.supplierLocalId != null ? masterUuid('proveedores', input.supplierLocalId) : null) ||
            supplierUuidByName(input.party.name);
        if (!supplierId) return { ok: false, error: 'No se pudo identificar el proveedor en el servidor.' };
        const warehouseId = warehouseIdByName(input.warehouse);
        if (!warehouseId) return { ok: false, error: 'No se pudo identificar el almacén en el servidor.' };
        const termsDays = Number(/(\d+)/.exec(input.party.terms || '')?.[1] ?? 0);
        const body = {
            supplierId,
            warehouseId,
            sellerUserId: input.seller ? userUuidByName(input.seller) : null,
            paymentTermsDays: termsDays,
            partyName: input.party.name,
            partyTaxId: input.party.ruc || null,
            partyAddress: input.party.address || null,
            partyContact: input.party.contact || null,
            partyEmail: input.party.email || null,
            origin: 'Compra directa',
            lines: input.lines.map(l => ({
                productId: productUuidBySku(l.sku),
                sku: l.sku,
                name: l.name,
                unit: l.unit,
                quantity: l.qty,
                unitPrice: l.price,
            })),
        };
        const rec = await api<Raw>('/purchase-orders', { method: 'POST', body });
        const order = toOrder(rec);
        update(d => {
            d.orders = [order, ...d.orders.filter(o => !(o.kind === 'compra' && o.code === order.code))];
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export interface ApproveReceiptInput {
    /** Cantidades realmente recibidas por SKU (si no se envía una línea, se asume lo pedido). */
    lines: { sku: string; quantity: number }[];
    warehouse: string;
    observations: string;
    /** Comprobante que entregó el proveedor: Factura, Boleta de venta, Nota de crédito… */
    invoiceType: string;
    invoiceNumber: string;
    /** Id del documento (archivo del comprobante) ya subido a /documents; vacío si no se adjuntó. */
    documentId: string;
}

/**
 * Kardex: aprueba la recepción de una OC. El servidor registra, como una sola operación, la nota de ingreso con las entradas
 * de inventario, la factura del proveedor y (si corresponde) el egreso de caja; si algo falla no deja nada a medias.
 */
export async function approveReceiptRemote(code: string, input: ApproveReceiptInput): Promise<OrderResult> {
    try {
        const rec = await api<Raw>(`/purchase-orders/${encodeURIComponent(code)}/approve-receipt`, {
            method: 'POST',
            // El monto, las fechas y el pago los resuelve el servidor (total recibido, condición de pago de la orden).
            body: {
                lines: input.lines,
                warehouse: input.warehouse || null,
                observations: input.observations || null,
                invoiceType: input.invoiceType,
                invoiceNumber: input.invoiceNumber,
                documentId: input.documentId || null,
            },
        });
        const order = toOrder(rec);
        update(d => {
            const i = d.orders.findIndex(o => o.code === code && o.kind === 'compra');
            if (i >= 0) d.orders[i] = order;
            else d.orders.unshift(order);
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function completePurchaseStepRemote(
    code: string,
    values: Record<string, string>,
): Promise<OrderResult> {
    try {
        const rec = await api<Raw>(`/purchase-orders/${encodeURIComponent(code)}/complete-step`, {
            method: 'POST',
            body: { values },
        });
        const order = toOrder(rec);
        update(d => {
            const i = d.orders.findIndex(o => o.code === code && o.kind === 'compra');
            if (i >= 0) d.orders[i] = order;
            else d.orders.unshift(order);
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function cancelPurchaseOrderRemote(code: string, reason?: string): Promise<OrderResult> {
    try {
        const rec = await api<Raw>(`/purchase-orders/${encodeURIComponent(code)}/cancel`, {
            method: 'POST',
            body: { reason: reason ?? null },
        });
        const order = toOrder(rec);
        update(d => {
            const i = d.orders.findIndex(o => o.code === code && o.kind === 'compra');
            if (i >= 0) d.orders[i] = order;
        });
        return { ok: true, order };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}