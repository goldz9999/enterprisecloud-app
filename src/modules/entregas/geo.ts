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

const routes = new Map<string, Promise<LatLng[] | null>>();

/** Trazo por calles que une los puntos en orden, o `null` si el servicio no responde. */
export function roadPath(points: LatLng[]): Promise<LatLng[] | null> {
    const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
    let p = routes.get(coords);
    if (!p) {
        p = fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
            .then(r => r.json() as Promise<{ routes?: { geometry: { coordinates: [number, number][] } }[] }>)
            .then(d => d.routes?.[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng) ?? null)
            .catch(() => null);
        routes.set(coords, p);
        void p.then(r => { if (!r) routes.delete(coords); });
    }
    return p;
}

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
