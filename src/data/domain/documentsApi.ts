import { api, ApiError } from '../../lib/api';

/** Documentos guardados en el servidor (Supabase Storage + tabla `documents`). */

export const DOC_CATEGORIES = ['Facturas', 'Contratos', 'Órdenes de compra', 'Guías de remisión', 'Otros'] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const CAT_CODE: Record<string, string> = { Facturas: 'INVOICE', Contratos: 'CONTRACT', 'Órdenes de compra': 'PURCHASE_ORDER', 'Guías de remisión': 'DISPATCH_GUIDE', Otros: 'OTHER' };
const CAT_LABEL: Record<string, string> = { INVOICE: 'Facturas', CONTRACT: 'Contratos', PURCHASE_ORDER: 'Órdenes de compra', DISPATCH_GUIDE: 'Guías de remisión', OTHER: 'Otros', ATTACHMENT: 'Otros' };

export interface RemoteDoc {
    id: string;
    name: string;
    cat: string;
    ref: string;
    entity: string;
    bytes: number;
    /** ISO date. */
    date: string;
    by: string;
    version: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function toDoc(r: Raw): RemoteDoc {
    const ref = r.order?.code ?? r.customer?.code ?? r.supplier?.code ?? 'Sin vincular';
    const entity = r.customer?.legalName ?? r.supplier?.legalName ?? (r.order ? 'Orden vinculada' : '—');
    return {
        id: r.id, name: r.name, cat: CAT_LABEL[r.category] ?? 'Otros', ref, entity, bytes: Number(r.byteSize) || 0,
        date: r.createdAt, by: r.uploader?.fullName ?? '—', version: `${r.versionLabel ?? 'v1'} · actual`,
    };
}

export async function listDocuments(): Promise<RemoteDoc[]> {
    const out: Raw[] = [];
    for (; ;) {
        const res = await api<{ items: Raw[]; total: number }>(`/documents?limit=200&offset=${out.length}`);
        out.push(...res.items);
        if (!res.items.length || out.length >= res.total) break;
    }
    return out.map(toDoc);
}

/** `relation`: `c:<id>` (cliente), `s:<id>` (proveedor) o '' (sin vincular). */
export async function uploadDocument(file: File, category: string, relation: string): Promise<RemoteDoc> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('category', CAT_CODE[category] ?? 'OTHER');
    form.append('versionLabel', 'v1');
    if (relation.startsWith('c:')) form.append('relatedCustomerId', relation.slice(2));
    if (relation.startsWith('s:')) form.append('relatedSupplierId', relation.slice(2));
    const created = await api<Raw>('/documents', { method: 'POST', body: form });
    return toDoc(created);
}

/** Pide una URL firmada (60 s) y arranca la descarga. El servidor registra la descarga en la auditoría. */
export async function downloadDocument(id: string): Promise<void> {
    const { url } = await api<{ url: string }>(`/documents/${id}/download-url`);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export const deleteDocument = (id: string) => api(`/documents/${id}`, { method: 'DELETE' });

export interface DocEvent {
    id: string;
    user: string;
    action: string;
    desc: string;
    at: string;
}

/** Subidas, descargas y bajas de un documento (la auditoría del servidor). Sin permiso de Auditoría devuelve []. */
export async function documentActivity(name: string): Promise<DocEvent[]> {
    try {
        const res = await api<{ items: Raw[] }>('/audit?module=documents&limit=200');
        return res.items
            .filter(e => e.referenceSnapshot === name)
            .map(e => ({ id: e.id, user: e.userNameSnapshot, action: e.action, desc: e.description, at: e.occurredAt }));
    } catch {
        return [];
    }
}

export function documentError(e: unknown): string {
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 413) return 'El archivo supera los 20 MB.';
        if (e.status === 415) return 'Tipo de archivo no permitido. Usa PDF, XML, Excel, Word, imágenes, CSV, TXT o ZIP.';
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'El documento ya no existe.';
        if (e.status === 502) return 'El almacenamiento no respondió. Inténtalo de nuevo.';
        return e.message;
    }
    return 'Ocurrió un error inesperado.';
}