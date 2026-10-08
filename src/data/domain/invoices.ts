import { api, ApiError } from '../../lib/api';
import { update } from '../store';
import type { Row } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const ids = new Map<string, number>();
const uuids = new Map<number, string>();
let seq = 0;
function localId(uuid: string): number {
    let n = ids.get(uuid);
    if (!n) {
        n = ++seq;
        ids.set(uuid, n);
        uuids.set(n, uuid);
    }
    return n;
}

function toRow(r: Raw): Row {
    return {
        _id: localId(String(r.id)),
        num: String(r.num || ''),
        tipo: String(r.tipo || ''),
        cliente: String(r.cliente || ''),
        ruc: String(r.ruc || ''),
        emision: String(r.emision || ''),
        vence: String(r.vence || '—'),
        total: Number(r.total) || 0,
        sunat: String(r.sunat || 'Pendiente'),
        orden: String(r.orden || ''),
    };
}

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'El comprobante ya no existe.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

let pending: Promise<void> | null = null;

export function loadInvoices(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const all: Raw[] = [];
                for (; ;) {
                    const res = await api<{ items: Raw[]; total: number }>(`/sales-invoices?limit=200&offset=${all.length}`);
                    all.push(...(res.items || []));
                    if (!res.items?.length || all.length >= (res.total || 0)) break;
                }
                update(d => {
                    d.records.comprobantes = all.map(toRow);
                });
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) {
                    update(d => {
                        d.records.comprobantes = [];
                    });
                }
            }
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

export type InvResult = { ok: true } | { ok: false; error: string };

export function invoiceUuid(localRowId: number): string | null {
    return uuids.get(localRowId) ?? null;
}

export async function setInvoiceTaxStatusRemote(localRowId: number, sunatUi: string): Promise<InvResult> {
    const uuid = uuids.get(localRowId);
    if (!uuid) return { ok: false, error: 'Comprobante no encontrado. Recarga la página.' };
    try {
        const rec = await api<Raw>(`/sales-invoices/${uuid}/tax-status`, {
            method: 'POST',
            body: { taxStatus: sunatUi },
        });
        update(d => {
            const i = d.records.comprobantes.findIndex(r => r._id === localRowId);
            if (i >= 0) d.records.comprobantes[i] = toRow(rec);
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function voidInvoiceRemote(localRowId: number, reason: string): Promise<InvResult> {
    const uuid = uuids.get(localRowId);
    if (!uuid) return { ok: false, error: 'Comprobante no encontrado. Recarga la página.' };
    try {
        await api(`/sales-invoices/${uuid}/void`, { method: 'POST', body: { reason } });
        await loadInvoices();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}