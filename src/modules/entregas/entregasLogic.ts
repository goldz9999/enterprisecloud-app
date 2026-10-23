import { PICKUP } from '@/data/domain/carriers';
import type { Order } from '@/data/types';

export interface Delivery {
    status: 'Entregado' | 'No entregado';
    receiver?: string;
    reason?: string;
    note?: string;
    at: string;
    by: string;
}

export interface Stop {
    code: string;
    client: string;
    address: string;
    guide: string;
    items: string;
    status: 'Pendiente' | Delivery['status'];
    delivery?: Delivery;
}

export interface Route {
    vehicle: string;
    driver: string;
    stops: Stop[];
}

/** Fecha de entrega (YYYY-MM-DD) elegida al crear o confirmar la venta. */
export const deliveryDate = (o: Order) => o.forms[1]?.ent || o.forms[0]?.ent || '';

const isPickup = (o: Order) => (o.forms[2]?.tra || o.forms[0]?.tra || '') === PICKUP;

const stopOf = (o: Order, saved: Record<string, Delivery>): Stop => ({
    code: o.code,
    client: o.party?.name ?? '',
    address: o.forms[2]?.lle || o.forms[1]?.dir || o.forms[0]?.dir || o.party?.address || '',
    guide: (o.docs[2] ?? '').replace(/^Guía\s*/, ''),
    items: o.lines.map(l => `${l.qty.toLocaleString('en-US')} ${l.unit} ${l.name}`).join(' · '),
    status: saved[o.code]?.status ?? 'Pendiente',
    delivery: saved[o.code],
});

/**
 * Hoja de ruta de un día: ventas ya despachadas (guía emitida) con entrega en `day`, agrupadas por vehículo;
 * las que recoge el cliente van aparte.
 */
export function routeSheet(orders: Order[], day: string, saved: Record<string, Delivery>) {
    const ready = orders
        .filter(o => o.kind === 'venta' && !o.cancelled && o.done >= 3 && deliveryDate(o) === day)
        .sort((a, b) => a.code.localeCompare(b.code));
    const pickups = ready.filter(isPickup).map(o => stopOf(o, saved));
    const map = new Map<string, Route>();
    for (const o of ready) {
        if (isPickup(o)) continue;
        const vehicle = o.forms[2]?.pla || o.forms[0]?.pla || 'Sin vehículo';
        const r = map.get(vehicle) ?? { vehicle, driver: o.forms[2]?.con || o.forms[0]?.con || '', stops: [] };
        r.stops.push(stopOf(o, saved));
        map.set(vehicle, r);
    }
    const routes = [...map.values()].sort((a, b) => a.vehicle.localeCompare(b.vehicle));
    const all = [...routes.flatMap(r => r.stops), ...pickups];
    return { routes, pickups, total: all.length, delivered: all.filter(s => s.status === 'Entregado').length, failed: all.filter(s => s.status === 'No entregado').length };
}