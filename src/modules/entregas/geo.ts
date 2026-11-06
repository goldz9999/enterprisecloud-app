import { useEffect, useState } from 'react';

export type LatLng = [number, number];

export const LIMA: LatLng = [-12.046374, -77.042793];

export const VEHICLE_COLORS = ['#2563eb', '#ea580c', '#0d9488', '#9333ea', '#db2777', '#ca8a04', '#0891b2', '#65a30d'];

// ── Geocodificación (Nominatim / OpenStreetMap) ─────────────────────────────
// Nominatim admite 1 consulta por segundo: las consultas a la red van en fila y lo encontrado
// se guarda en localStorage para no volver a pedirlo.

const memory = new Map<string, LatLng | null>();
let queue: Promise<unknown> = Promise.resolve();

const storageKey = (q: string) => `geo:${q.toLowerCase()}`;

function cached(q: string): LatLng | null | undefined {
    if (memory.has(q)) return memory.get(q);
    try {
        const v = localStorage.getItem(storageKey(q));
        if (v) {
            const ll = JSON.parse(v) as LatLng;
            memory.set(q, ll);
            return ll;
        }
    } catch { /* sin almacenamiento */ }
    return undefined;
}

async function nominatim(q: string): Promise<LatLng | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!r.ok) return null;
    const data = (await r.json()) as { lat: string; lon: string }[];
    return data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
}

/** Variantes de una dirección, de la más precisa a la más general. */
function variants(address: string): string[] {
    const clean = address.replace(/\s+/g, ' ').trim();
    const first = clean.split(',')[0].trim();
    const noNumber = first.replace(/\s+\d+[\w-]*$/, '').trim();
    return [...new Set([`${clean}, Lima, Perú`, `${first}, Lima, Perú`, `${noNumber}, Lima, Perú`])];
}

/** Coordenadas de una dirección de Lima, o `null` si no se encuentra. */
export function geocode(address: string): Promise<LatLng | null> {
    const hit = cached(address);
    if (hit !== undefined) return Promise.resolve(hit);
    const job = queue.then(async () => {
        const again = cached(address);
        if (again !== undefined) return again;
        let found: LatLng | null = null;
        for (const q of variants(address)) {
            try { found = await nominatim(q); } catch { found = null; }
            await new Promise(r => setTimeout(r, 1100));
            if (found) break;
        }
        memory.set(address, found);
        if (found) try { localStorage.setItem(storageKey(address), JSON.stringify(found)); } catch { /* sin almacenamiento */ }
        return found;
    });
    queue = job;
    return job;
}

/** Geocodifica varias direcciones. Devuelve lo resuelto hasta ahora (null = no encontrada) y cuántas faltan. */
export function useGeocode(addresses: string[]) {
    const list = [...new Set(addresses.filter(Boolean))].sort();
    const key = list.join('|');
    const [found, setFound] = useState<Record<string, LatLng | null>>({});

    useEffect(() => {
        let alive = true;
        const now: Record<string, LatLng | null> = {};
        for (const a of list) {
            const hit = cached(a);
            if (hit !== undefined) now[a] = hit;
            else void geocode(a).then(ll => { if (alive) setFound(p => ({ ...p, [a]: ll })); });
        }
        setFound(now);
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { coords: found, pending: list.filter(a => !(a in found)).length };
}

// ── Ruta por calles (OSRM, servidor público) ────────────────────────────────

export interface RoadRoute {
    path: LatLng[];
    /** Duración estimada en segundos y distancia en metros. */
    seconds: number;
    meters: number;
}

const routes = new Map<string, Promise<RoadRoute | null>>();

/** Recorrido por calles que une los puntos en orden, o `null` si el servicio no responde. */
export function roadRoute(points: LatLng[]): Promise<RoadRoute | null> {
    const coords = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    let p = routes.get(coords);
    if (!p) {
        p = fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
            .then(r => r.json() as Promise<{ routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[] }>)
            .then(d => {
                const r = d.routes?.[0];
                return r ? { path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng), seconds: r.duration, meters: r.distance } : null;
            })
            .catch(() => null);
        routes.set(coords, p);
        void p.then(r => { if (!r) routes.delete(coords); });
    }
    return p;
}

export const roadPath = (points: LatLng[]) => roadRoute(points).then(r => r?.path ?? null);

/**
 * Orden de visita: desde `start`, siempre la parada más cercana que falta.
 * Las que no tienen coordenadas van al final, en su orden original.
 */
export function orderByNearest<T extends { ll: LatLng | null }>(start: LatLng | null, items: T[]): T[] {
    const left = items.filter(i => i.ll);
    const out: T[] = [];
    let at = start ?? left[0]?.ll ?? null;
    while (left.length && at) {
        let best = 0;
        for (let i = 1; i < left.length; i++) if (distanceKm(at, left[i].ll!) < distanceKm(at, left[best].ll!)) best = i;
        const [next] = left.splice(best, 1);
        out.push(next);
        at = next.ll;
    }
    return [...out, ...items.filter(i => !i.ll)];
}

/** Punto a `meters` del inicio de un recorrido. */
export function pointAlong(path: LatLng[], meters: number): LatLng {
    let left = meters;
    for (let i = 1; i < path.length; i++) {
        const seg = distanceKm(path[i - 1], path[i]) * 1000;
        if (left <= seg && seg > 0) {
            const t = left / seg;
            return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
        }
        left -= seg;
    }
    return path[path.length - 1];
}

export const pathMeters = (path: LatLng[]) => path.reduce((m, p, i) => (i ? m + distanceKm(path[i - 1], p) * 1000 : 0), 0);

/** Distancia en km en línea recta. */
export function distanceKm(a: LatLng, b: LatLng): number {
    const rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Abre Google Maps (o la app de mapas del celular) con indicaciones hasta la dirección. */
export const navigateUrl = (address: string, ll?: LatLng | null) =>
    `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address ? `${address}, Lima, Perú` : ll ? `${ll[0]},${ll[1]}` : '')}`;
