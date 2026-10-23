import type { OrderLine } from '@/data/types';

/** Orden de compra sugerida por «Reposición sugerida», para abrir el modal de Compras ya lleno. */
export interface PurchasePrefill {
    supplier: string;
    warehouse: string;
    lines: OrderLine[];
}

const KEY = 'ec-prefill-oc';

export function savePurchasePrefill(p: PurchasePrefill) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        // sin almacenamiento: el modal se abre vacío
    }
}

/** Lee y borra la sugerencia (se usa una sola vez). */
export function takePurchasePrefill(): PurchasePrefill | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return raw ? (JSON.parse(raw) as PurchasePrefill) : null;
    } catch {
        return null;
    }
}