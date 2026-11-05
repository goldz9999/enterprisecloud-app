import { useMemo } from 'react';
import type { Row } from '@/data/types';
import type { Route } from './entregasLogic';
import { useGeocode, VEHICLE_COLORS, type LatLng } from './geo';
import type { MapRoute } from './RouteMap';

/** Dirección geocodificable de un almacén del maestro. */
const warehouseAddress = (w: Row | undefined) => (w ? [w.dir, w.distrito].filter(Boolean).map(String).join(', ') : '');

/**
 * Rutas del día listas para el mapa: cada camión con su color (el mismo en todas las vistas),
 * su almacén de salida y sus paradas con coordenadas. `only` limita la geocodificación a un camión.
 */
export function useMapRoutes(routes: Route[], warehouses: Row[], only?: string) {
    const active = warehouses.filter(w => w.estado !== 'Inactivo');
    const fallback = active.find(w => w.tipo === 'Principal') ?? active[0];
    const whOf = (name: string) => active.find(w => w.nombre === name) ?? fallback;

    const wanted = routes.filter(r => !only || r.vehicle === only);
    const { coords, pending } = useGeocode([
        ...wanted.flatMap(r => r.stops.map(s => s.address)),
        ...wanted.map(r => warehouseAddress(whOf(r.warehouse))),
    ]);

    const sig = JSON.stringify(routes.map(r => [r.vehicle, r.warehouse, r.stops.map(s => [s.code, s.status, s.address])]))
        + JSON.stringify(active.map(w => [w.nombre, w.dir, w.distrito]));

    const mapRoutes = useMemo<MapRoute[]>(() => routes.map((r, i) => {
        const wh = whOf(r.warehouse);
        const whLl: LatLng | null = wh ? coords[warehouseAddress(wh)] ?? null : null;
        return {
            vehicle: r.vehicle,
            color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
            warehouse: wh ? { name: String(wh.nombre), ll: whLl } : null,
            stops: r.stops.map((s, j) => ({ code: s.code, n: j + 1, client: s.client, address: s.address, status: s.status, ll: coords[s.address] ?? null })),
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [sig, coords]);

    const missing = mapRoutes.filter(r => !only || r.vehicle === only).flatMap(r => r.stops).filter(s => !s.ll && s.address && coords[s.address] === null);

    return { mapRoutes, pending, missing };
}
