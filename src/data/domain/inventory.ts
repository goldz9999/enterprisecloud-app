import { api, ApiError } from '../../lib/api';
import { update } from '../store';
import type { DB, Row } from '../types';
import { productByNameRaw, productUuidBySku, warehouseIdByName } from './masters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function explain(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'El registro ya no existe.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

const seqMaps = {
    stock: new Map<string, number>(),
    kardex: new Map<string, number>(),
    transferencias: new Map<string, number>(),
    ajustes: new Map<string, number>(),
};
let seq = 0;
function lid(map: Map<string, number>, key: string): number {
    let n = map.get(key);
    if (!n) { n = ++seq; map.set(key, n); }
    return n;
}

// ---------- stock ----------
function stockRow(r: Raw): Row {
    return {
        _id: lid(seqMaps.stock, `${r.productId}-${r.warehouseId}`),
        sku: String(r.sku || ''),
        prod: String(r.prod || ''),
        cat: String(r.cat || ''),
        alm: String(r.alm || ''),
        stock: Number(r.stock) || 0,
        min: Number(r.min) || 0,
        res: Number(r.res) || 0,
        estado: String(r.estado || 'Normal'),
    };
}

export async function loadStock(): Promise<void> {
    try {
        const all: Raw[] = [];
        for (; ;) {
            const res = await api<{ items: Raw[]; total: number }>(`/stock?limit=200&offset=${all.length}`);
            all.push(...(res.items || []));
            if (!res.items?.length || all.length >= (res.total || 0)) break;
        }
        update(d => { d.records.stock = all.map(stockRow); });
    } catch (e) {
        if (e instanceof ApiError && e.status === 403) update(d => { d.records.stock = []; });
    }
}

// ---------- kardex ----------
function kardexRow(r: Raw): Row {
    return {
        _id: lid(seqMaps.kardex, String(r.id)),
        fecha: String(r.fecha || ''),
        sku: String(r.sku || ''),
        prod: String(r.prod || ''),
        alm: String(r.alm || ''),
        tipo: String(r.tipo || ''),
        cant: Number(r.cant) || 0,
        delta: Number(r.delta) || 0,
        costo: Number(r.costo) || 0,
        ref: String(r.ref || ''),
    };
}

export async function loadKardex(): Promise<void> {
    try {
        const all: Raw[] = [];
        for (; ;) {
            const res = await api<{ items: Raw[]; total: number }>(`/kardex?limit=200&offset=${all.length}`);
            all.push(...(res.items || []));
            if (!res.items?.length || all.length >= (res.total || 0)) break;
        }
        update(d => { d.records.kardex = all.map(kardexRow); });
    } catch (e) {
        if (e instanceof ApiError && e.status === 403) update(d => { d.records.kardex = []; });
    }
}

// ---------- transfers ----------
function transferRow(r: Raw): Row {
    return {
        _id: lid(seqMaps.transferencias, String(r.id || r.code)),
        cod: String(r.code || ''),
        fecha: String(r.fecha || ''),
        origen: String(r.origen || ''),
        destino: String(r.destino || ''),
        estado: String(r.estado || 'Pendiente'),
        items: String(r.items || ''),
        uuid: String(r.id || ''),
    };
}

export async function loadTransfers(): Promise<void> {
    try {
        const all: Raw[] = [];
        for (; ;) {
            const res = await api<{ items: Raw[]; total: number }>(`/transfers?limit=200&offset=${all.length}`);
            all.push(...(res.items || []));
            if (!res.items?.length || all.length >= (res.total || 0)) break;
        }
        update(d => { d.records.transferencias = all.map(transferRow); });
    } catch (e) {
        if (e instanceof ApiError && e.status === 403) update(d => { d.records.transferencias = []; });
    }
}

export type InvResult = { ok: true } | { ok: false; error: string };

export async function createTransferRemote(values: {
    origen: string;
    destino: string;
    lines: { sku: string; name: string; unit: string; qty: number }[];
}): Promise<InvResult> {
    try {
        const sourceWarehouseId = warehouseIdByName(values.origen);
        const destinationWarehouseId = warehouseIdByName(values.destino);
        if (!sourceWarehouseId || !destinationWarehouseId) {
            return { ok: false, error: 'Almacén de origen o destino no encontrado.' };
        }
        await api('/transfers', {
            method: 'POST',
            body: {
                sourceWarehouseId,
                destinationWarehouseId,
                lines: values.lines.map(l => ({
                    productId: productUuidBySku(l.sku),
                    sku: l.sku,
                    name: l.name,
                    unit: l.unit,
                    quantity: l.qty,
                })),
            },
        });
        await loadTransfers();
        await loadStock();
        await loadKardex();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function dispatchTransferRemote(codeOrId: string): Promise<InvResult> {
    try {
        await api(`/transfers/${encodeURIComponent(codeOrId)}/dispatch`, { method: 'POST' });
        await loadTransfers();
        await loadStock();
        await loadKardex();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function receiveTransferRemote(codeOrId: string): Promise<InvResult> {
    try {
        await api(`/transfers/${encodeURIComponent(codeOrId)}/receive`, { method: 'POST' });
        await loadTransfers();
        await loadStock();
        await loadKardex();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function cancelTransferRemote(codeOrId: string): Promise<InvResult> {
    try {
        await api(`/transfers/${encodeURIComponent(codeOrId)}/cancel`, { method: 'POST' });
        await loadTransfers();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

// ---------- adjustments ----------
function adjRow(r: Raw): Row {
    return {
        _id: lid(seqMaps.ajustes, String(r.id || r.code)),
        cod: String(r.code || ''),
        fecha: String(r.fecha || ''),
        sku: String(r.sku || ''),
        prod: String(r.prod || ''),
        alm: String(r.alm || ''),
        tipo: String(r.tipo || ''),
        cant: Number(r.cant) || 0,
        motivo: String(r.motivo || ''),
        uuid: String(r.id || ''),
    };
}

export async function loadAdjustments(): Promise<void> {
    try {
        const all: Raw[] = [];
        for (; ;) {
            const res = await api<{ items: Raw[]; total: number }>(`/adjustments?limit=200&offset=${all.length}`);
            all.push(...(res.items || []));
            if (!res.items?.length || all.length >= (res.total || 0)) break;
        }
        update(d => { d.records.ajustes = all.map(adjRow); });
    } catch (e) {
        if (e instanceof ApiError && e.status === 403) update(d => { d.records.ajustes = []; });
    }
}

export async function createAdjustmentRemote(values: {
    prod: string;
    alm: string;
    tipo: string;
    cant: number;
    motivo: string;
}): Promise<InvResult> {
    try {
        const p = productByNameRaw(values.prod) || (productUuidBySku(values.prod) ? { id: productUuidBySku(values.prod)!, sku: values.prod, name: values.prod, unit: 'Unidad' } : null);
        if (!p) return { ok: false, error: 'Producto no encontrado.' };
        const warehouseId = warehouseIdByName(values.alm);
        if (!warehouseId) return { ok: false, error: 'Almacén no encontrado.' };
        await api('/adjustments', {
            method: 'POST',
            body: {
                productId: p.id,
                warehouseId,
                adjustmentType: values.tipo,
                quantity: values.cant,
                reason: values.motivo,
            },
        });
        await loadAdjustments();
        await loadStock();
        await loadKardex();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

/** Carga todo el inventario remoto. */
export function loadInventory(): Promise<void> {
    return Promise.all([loadStock(), loadKardex(), loadTransfers(), loadAdjustments()]).then(() => undefined);
}
