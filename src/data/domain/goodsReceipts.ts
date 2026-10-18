import { api, ApiError } from '@/shared/lib/api';
import { update } from '../store';
import type { Row } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const ids = new Map<string, number>();
let seq = 0;
function localId(key: string): number {
    let n = ids.get(key);
    if (!n) { n = ++seq; ids.set(key, n); }
    return n;
}

function toRow(r: Raw): Row {
    return {
        _id: localId(String(r.id)),
        ni: String(r.ni || '—'),
        fecha: String(r.fecha || ''),
        oc: String(r.oc || ''),
        prov: String(r.prov || ''),
        alm: String(r.alm || ''),
        items: String(r.items || ''),
        estado: String(r.estado || 'Por recibir'),
        recibe: String(r.recibe || '—'),
        obs: String(r.obs || ''),
    };
}

let cache: Row[] = [];
let pending: Promise<void> | null = null;

export function getReceiptRows(): Row[] {
    return cache;
}

export function loadGoodsReceipts(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            try {
                const res = await api<{ items: Raw[] }>('/goods-receipts?limit=200');
                cache = (res.items || []).map(toRow);
                // no hace falta tocar el store genérico; recepcion.ts usa source()
                update(() => { /* notify subscribers */ });
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) cache = [];
            }
        })().finally(() => { pending = null; });
    }
    return pending;
}