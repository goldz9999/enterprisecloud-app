import { useMemo } from 'react';
import type { Domain } from '@/data/loadAll';
import { useDB } from '@/data/store';
import type { DB, Order, RecordCollection, Row } from '@/data/types';
import { readModule, useModuleStore, writeModule } from './localStore';

/**
 * Copia local de los datos del sistema para los módulos de Gestión.
 *
 * El sistema sigue leyendo y guardando en la base de datos como siempre (Mantenimiento, Importar datos,
 * Ventas, Compras, Inventario, Finanzas…). Cada vez que esos datos cambian en pantalla —al importar,
 * crear una venta, cobrar, ajustar stock o recibir un aviso en tiempo real— se actualiza esta copia en el
 * navegador. Los módulos de Gestión leen SOLO de aquí, así el día que pasen a la base de datos solo cambia
 * de dónde leen.
 *
 * Solo se copia lo que se descargó bien del servidor en esta sesión: si una lectura falla, se conserva lo
 * que ya había en la copia (no se reemplaza por una lista vacía).
 */

/** Partes de la copia: qué colecciones vienen de qué carga del sistema. */
export interface CopyPart {
    id: string;
    label: string;
    /** Colecciones de d.records que trae esta parte. */
    colls?: RecordCollection[];
    /** Órdenes de este tipo (d.orders). */
    orders?: Order['kind'];
    /** Carga del sistema (loadAll) que la trae; si no hay, es un maestro (loadMasters) o Administración. */
    domain?: Domain;
    /** Ruta del backend, para saber si la última lectura falló. */
    path?: string;
}

export const COPY_PARTS: CopyPart[] = [
    { id: 'clientes', label: 'Clientes', colls: ['clientes'] },
    { id: 'proveedores', label: 'Proveedores', colls: ['proveedores'] },
    { id: 'productos', label: 'Productos', colls: ['productos'] },
    { id: 'categorias', label: 'Categorías', colls: ['categorias'] },
    { id: 'almacenes', label: 'Almacenes', colls: ['almacenes'] },
    { id: 'conductores', label: 'Conductores', colls: ['conductores'] },
    { id: 'vehiculos', label: 'Vehículos', colls: ['vehiculos'] },
    { id: 'preciosProv', label: 'Precios por proveedor', colls: ['preciosProv'] },
    { id: 'usuarios', label: 'Usuarios (vendedores)', colls: ['usuarios'] },
    { id: 'stock', label: 'Stock por almacén', colls: ['stock'], domain: 'stock', path: '/stock' },
    { id: 'ventas', label: 'Órdenes de venta', orders: 'venta', domain: 'sales', path: '/sales-orders' },
    { id: 'compras', label: 'Órdenes de compra', orders: 'compra', domain: 'purchases', path: '/purchase-orders' },
    { id: 'comprobantes', label: 'Comprobantes', colls: ['comprobantes'], domain: 'invoices', path: '/sales-invoices' },
    { id: 'cxc', label: 'Cuentas por cobrar', colls: ['cxc'], domain: 'receivables', path: '/receivables' },
    { id: 'cxp', label: 'Cuentas por pagar', colls: ['cxp'], domain: 'payables', path: '/payables' },
    { id: 'caja', label: 'Caja', colls: ['caja'], domain: 'cash', path: '/cash' },
    { id: 'bancos', label: 'Bancos', colls: ['bancos'], domain: 'bank', path: '/bank-movements' },
];

/** Cargas del sistema que alimentan la copia (para «Actualizar ahora»). */
export const COPY_DOMAINS = [...new Set(COPY_PARTS.map(p => p.domain).filter((x): x is Domain => !!x))];

export interface LocalCopy {
    /** Última vez que cambió algo (ISO). */
    updatedAt: string;
    /** Última vez que se copió cada parte (ISO). */
    parts: Record<string, string>;
    records: Partial<Record<RecordCollection, Row[]>>;
    orders: Order[];
}

export const EMPTY_COPY: LocalCopy = { updatedAt: '', parts: {}, records: {}, orders: [] };
export const COPY_ID = 'copia';

/**
 * Nueva copia: toma del sistema las partes listas (`ready`) y deja las demás como estaban.
 * Devuelve la misma copia si nada cambió.
 */
export function mergeCopy(prev: LocalCopy, d: DB, ready: (p: CopyPart) => boolean, now: Date): LocalCopy {
    let changed = false;
    const records = { ...prev.records };
    let orders = prev.orders;
    const parts = { ...prev.parts };
    for (const p of COPY_PARTS) {
        if (!ready(p)) continue;
        for (const c of p.colls ?? []) {
            const next = d.records[c] ?? [];
            if (JSON.stringify(records[c] ?? []) !== JSON.stringify(next)) {
                records[c] = next;
                changed = true;
                parts[p.id] = now.toISOString();
            } else if (!parts[p.id]) {
                parts[p.id] = now.toISOString();
                changed = true;
            }
        }
        if (p.orders) {
            const mine = d.orders.filter(o => o.kind === p.orders);
            const kept = orders.filter(o => o.kind !== p.orders);
            const before = orders.filter(o => o.kind === p.orders);
            if (JSON.stringify(before) !== JSON.stringify(mine)) {
                orders = [...kept, ...mine];
                changed = true;
                parts[p.id] = now.toISOString();
            } else if (!parts[p.id]) {
                parts[p.id] = now.toISOString();
                changed = true;
            }
        }
    }
    return changed ? { updatedAt: now.toISOString(), parts, records, orders } : prev;
}

export const readCopy = () => readModule<LocalCopy>(COPY_ID, EMPTY_COPY);
export const writeCopy = (c: LocalCopy) => writeModule(COPY_ID, c);
export const hasCopy = (c: LocalCopy) => Object.keys(c.parts).length > 0;

/** Arma el DB que ven los módulos de Gestión: configuración y sesión del sistema, datos de la copia local. */
export function fromCopy(real: DB, copy: LocalCopy): DB {
    const records = { ...real.records } as DB['records'];
    for (const p of COPY_PARTS) for (const c of p.colls ?? []) records[c] = copy.records[c] ?? [];
    return { ...real, records, orders: copy.orders };
}

/** DB de los módulos de Gestión: siempre desde la copia local. */
export function useGestionDB(): DB {
    const real = useDB();
    const [copy] = useModuleStore<LocalCopy>(COPY_ID, EMPTY_COPY);
    return useMemo(() => fromCopy(real, copy), [real, copy]);
}

/** Estado de la copia (para avisos y Configuración). */
export function useLocalCopy() {
    return useModuleStore<LocalCopy>(COPY_ID, EMPTY_COPY)[0];
}