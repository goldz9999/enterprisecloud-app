import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Map as LMap, Marker, Polyline } from 'leaflet';
import { useDB } from '@/data/store';
import { isoDate } from '@/shared/lib/dates';
import { mapApi, useDeliveries } from '../gestionApi';
import { dispatchedOn, routeSheet, type Stop } from './entregasLogic';

type LatLng = [number, number];

function getCached(address: string): LatLng | null {
    try { const v = localStorage.getItem(`geo:${address}`); return v ? JSON.parse(v) : null; } catch { return null; }
}
function setCache(address: string, c: LatLng) {
    try { localStorage.setItem(`geo:${address}`, JSON.stringify(c)); } catch {}
}

async function nominatim(address: string): Promise<LatLng | null> {
    const hit = getCached(address);
    if (hit) return hit;
    try {
        const q = encodeURIComponent(`${address}, Lima, Perú`);
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=pe`,
            { headers: { 'User-Agent': 'EnterpriseCloud-ERP/1.0' } },
        );
        const data: { lat: string; lon: string }[] = await r.json();
        if (data[0]) {
            const c: LatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            setCache(address, c);
            return c;
        }
    } catch {}
    return null;
}

async function osrmRoute(wps: LatLng[]): Promise<LatLng[]> {
    if (wps.length < 2) return wps;
    const coords = wps.map(([lat, lng]) => `${lng},${lat}`).join(';');
    try {
        const r = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
        );
        const data = await r.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
        if (data.routes?.[0]) return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch {}
    return wps;
}

const STATUS_COLOR: Record<Stop['status'], string> = {
    'Pendiente': '#f59e0b',
    'Entregado': '#22c55e',
    'No entregado': '#ef4444',
};

const navUrl = (gps: LatLng | null, address: string) =>
    gps
        ? `https://www.google.com/maps/dir/${gps[0]},${gps[1]}/${encodeURIComponent(address)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function RutaRepartidorPage() {
    const { placa = '' } = useParams<{ placa: string }>();
    const [params] = useSearchParams();
    const day = params.get('day') || isoDate(new Date());
    const navigate = useNavigate();

    const d = useDB();
    const orderCodes = dispatchedOn(d.orders, day).map(o => o.code);
    const deliveries = useDeliveries(orderCodes);
    const sheet = routeSheet(d.orders, day, deliveries.data);
    const route = sheet.routes.find(r => r.vehicle === placa);
    const stops = route?.stops ?? [];

    const [coords, setCoords] = useState<Record<string, LatLng>>({});
    const [geocoding, setGeocoding] = useState(false);
    const [warehouse, setWarehouse] = useState<{ name: string; lat: number; lng: number } | null>(null);
    const [gpsPos, setGpsPos] = useState<LatLng | null>(null);
    const [gpsEnabled, setGpsEnabled] = useState(false);
    const [gpsError, setGpsError] = useState('');
    const [listOpen, setListOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LMap | null>(null);
    const gpsMarkerRef = useRef<Marker | null>(null);
    const stopMarkersRef = useRef<Marker[]>([]);
    const whMarkerRef = useRef<Marker | null>(null);
    const routePolyRef = useRef<Polyline | null>(null);

    // Cargar almacén desde el backend (opcional)
    useEffect(() => {
        mapApi.getMap(day)
            .then(data => {
                const w = data.warehouses.find(wh => wh.lat != null && wh.lng != null);
                if (w?.lat && w?.lng) setWarehouse({ name: w.name, lat: w.lat, lng: w.lng });
            })
            .catch(() => {});
    }, [day]);

    // Geocodificar stops sin coordenadas (1 req/sec Nominatim)
    const stopKeys = stops.map(s => s.code).join(',');
    useEffect(() => {
        const todo = stops.filter(s => s.address && !coords[s.code]);
        if (!todo.length) return;
        setGeocoding(true);
        let cancelled = false;
        (async () => {
            for (const s of todo) {
                if (cancelled) break;
                const result = await nominatim(s.address);
                if (result && !cancelled) setCoords(prev => ({ ...prev, [s.code]: result }));
                await new Promise(r => setTimeout(r, 1100));
            }
            if (!cancelled) setGeocoding(false);
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopKeys]);

    // Inicializar mapa
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        import('leaflet').then(({ default: L }) => {
            const map = L.map(containerRef.current!, { zoomControl: false }).setView([-12.046374, -77.042793], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
                maxZoom: 19,
            }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);
            mapRef.current = map;
        });
        return () => { mapRef.current?.remove(); mapRef.current = null; };
    }, []);

    // Actualizar marcadores y trazar ruta OSRM
    useEffect(() => {
        if (!mapRef.current) return;
        import('leaflet').then(async ({ default: L }) => {
            const map = mapRef.current!;

            stopMarkersRef.current.forEach(m => m.remove()); stopMarkersRef.current = [];
            whMarkerRef.current?.remove(); whMarkerRef.current = null;
            routePolyRef.current?.remove(); routePolyRef.current = null;

            const bounds: LatLng[] = [];

            // Almacén
            if (warehouse) {
                whMarkerRef.current = L.marker([warehouse.lat, warehouse.lng], {
                    icon: L.divIcon({
                        className: '',
                        iconAnchor: [16, 16],
                        html: `<div style="width:32px;height:32px;border-radius:6px;background:#0f172a;border:2px solid #3b82f6;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(59,130,246,.5)">🏭</div>`,
                    }),
                }).addTo(map).bindPopup(`<b>🏭 ${warehouse.name}</b><br><small>Almacén de salida</small>`);
                bounds.push([warehouse.lat, warehouse.lng]);
            }

            // Stops geocodificados
            const orderedWps: LatLng[] = warehouse ? [[warehouse.lat, warehouse.lng]] : [];
            stops.forEach((s, i) => {
                const ll = coords[s.code];
                if (!ll) return;
                orderedWps.push(ll);
                bounds.push(ll);
                const col = STATUS_COLOR[s.status];
                const icon = L.divIcon({
                    className: '',
                    iconAnchor: [14, 14],
                    popupAnchor: [0, -18],
                    html: `<div style="width:28px;height:28px;border-radius:50%;background:${col};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;box-shadow:0 1px 6px rgba(0,0,0,.5)">${s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '✗' : i + 1}</div>`,
                });
                const m = L.marker(ll, { icon }).addTo(map)
                    .bindPopup(`<b>${i + 1}. ${s.client}</b><br>${s.address}<br><span style="color:${col};font-weight:600">${s.status}</span>`);
                stopMarkersRef.current.push(m);
            });

            // Trazar ruta completa con OSRM
            if (orderedWps.length >= 2) {
                const routeCoords = await osrmRoute(orderedWps);
                if (mapRef.current) {
                    routePolyRef.current = L.polyline(routeCoords as [number, number][], {
                        color: '#3b82f6', weight: 4, opacity: 0.85,
                    }).addTo(mapRef.current);
                }
            }

            if (bounds.length > 0 && mapRef.current) {
                mapRef.current.fitBounds(bounds as [number, number][], { padding: [50, 50], maxZoom: 14 });
            }
        });
    }, [coords, stops, warehouse]);

    // GPS en tiempo real
    useEffect(() => {
        if (!gpsEnabled || !mapRef.current) return;
        let watchId: number;
        import('leaflet').then(({ default: L }) => {
            const icon = L.divIcon({
                className: '',
                iconAnchor: [18, 18],
                html: `<div style="width:36px;height:36px;border-radius:50%;background:#0f172a;border:3px solid #3b82f6;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 12px rgba(59,130,246,.7)">🚚</div>`,
            });
            watchId = navigator.geolocation.watchPosition(
                pos => {
                    const ll: LatLng = [pos.coords.latitude, pos.coords.longitude];
                    setGpsPos(ll);
                    if (!gpsMarkerRef.current) {
                        gpsMarkerRef.current = L.marker(ll, { icon, zIndexOffset: 1000 })
                            .addTo(mapRef.current!).bindPopup('Tu posición actual');
                    } else { gpsMarkerRef.current.setLatLng(ll); }
                    setGpsError('');
                },
                err => setGpsError(err.message),
                { enableHighAccuracy: true, maximumAge: 5000 },
            );
        });
        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            gpsMarkerRef.current?.remove(); gpsMarkerRef.current = null;
            setGpsPos(null);
        };
    }, [gpsEnabled]);

    const done = stops.filter(s => s.status === 'Entregado').length;
    const pending = stops.filter(s => s.status === 'Pendiente').length;
    const failed = stops.filter(s => s.status === 'No entregado').length;
    const nextPending = stops.find(s => s.status === 'Pendiente');
    const geocodedCount = Object.keys(coords).length;
    const needsGeocode = stops.filter(s => s.address && !coords[s.code]).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', isolation: 'isolate', color: '#f8fafc', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#1e293b', borderBottom: '1px solid #334155', flexShrink: 0 }}>
                <button type="button" onClick={() => navigate(-1)}
                    style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: '#334155', color: '#94a3b8', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ‹
                </button>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🚚</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.02em' }}>{placa}</div>
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {route?.driver || 'Sin conductor'} · {day}
                    </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 22, color: done === stops.length && stops.length > 0 ? '#4ade80' : '#f8fafc', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {done}/{stops.length}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em' }}>entregas</div>
                </div>
            </div>

            {/* ── GPS / geocoding bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#0f172a', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
                <button type="button" onClick={() => setGpsEnabled(v => !v)}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                        background: gpsEnabled ? '#1d4ed8' : '#1e293b', color: gpsEnabled ? '#fff' : '#64748b',
                        display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>📍</span>{gpsEnabled ? 'GPS activo' : 'Activar GPS'}
                </button>
                <div style={{ flex: 1, fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {gpsError && <span style={{ color: '#fca5a5' }}>⚠ GPS denegado · </span>}
                    {geocoding
                        ? <span style={{ color: '#94a3b8' }}>Geocodificando {needsGeocode} dirección(es)…</span>
                        : geocodedCount > 0
                            ? <span style={{ color: '#4ade80' }}>✓ {geocodedCount}/{stops.length} en mapa</span>
                            : null}
                </div>
                {pending > 0 && <span style={{ flexShrink: 0, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>{pending} pend.</span>}
            </div>

            {/* ── Mapa ── */}
            <div style={{ flex: listOpen ? '0 0 35vh' : '1 1 auto', minHeight: 160, position: 'relative', transition: 'flex .25s ease' }}>
                <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
                {stops.length > 0 && geocodedCount === 0 && !geocoding && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10, padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 40 }}>📍</div>
                        <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5 }}>Geocodificando direcciones…<br />Usa los links de Google Maps mientras tanto.</div>
                    </div>
                )}
            </div>

            {/* ── Próxima parada ── */}
            {nextPending && (
                <div style={{ padding: '10px 14px', background: '#1e293b', borderTop: '2px solid #3b82f6', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 5 }}>
                        📍 Próxima parada
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{nextPending.client}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextPending.address}</div>
                        </div>
                        <a href={navUrl(gpsPos, nextPending.address)} target="_blank" rel="noopener noreferrer"
                            style={{ flexShrink: 0, padding: '8px 14px', background: '#1d4ed8', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                            🧭 Navegar
                        </a>
                    </div>
                </div>
            )}

            {/* ── Toggle lista ── */}
            <button type="button" onClick={() => setListOpen(v => !v)}
                style={{ padding: '8px 16px', background: '#1e293b', border: 'none', borderTop: '1px solid #334155', color: '#64748b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10 }}>{listOpen ? '▼' : '▲'}</span>
                {listOpen ? 'Ocultar lista' : `Todas las paradas (${stops.length})`}
            </button>

            {/* ── Lista de paradas ── */}
            {listOpen && (
                <div style={{ maxHeight: '40vh', overflowY: 'auto', background: '#0f172a', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
                    {stops.length === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#475569', fontSize: 14 }}>
                            Sin paradas para {placa} hoy.
                        </div>
                    ) : stops.map((s, i) => (
                        <div key={s.code} style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: STATUS_COLOR[s.status], color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                                {s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '✗' : i + 1}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: STATUS_COLOR[s.status] }}>{s.client}</div>
                                <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>
                                {s.delivery?.status === 'Entregado' && (
                                    <div style={{ fontSize: 10, color: '#4ade80' }}>Recibió: {s.delivery.receiver}</div>
                                )}
                                {s.delivery?.status === 'No entregado' && (
                                    <div style={{ fontSize: 10, color: '#f87171' }}>{s.delivery.reason}</div>
                                )}
                            </div>
                            {s.address && (
                                <a href={navUrl(gpsPos, s.address)} target="_blank" rel="noopener noreferrer"
                                    style={{ flexShrink: 0, padding: '6px 10px', background: '#1e3a5f', color: '#60a5fa', borderRadius: 8, fontSize: 18, textDecoration: 'none', lineHeight: 1 }}>
                                    🗺
                                </a>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Footer ── */}
            {stops.length > 0 && (
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: '8px 16px', background: '#1e293b', borderTop: '1px solid #334155', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: '#f59e0b', fontSize: 13 }}>⏳ {pending}</span>
                    <span style={{ color: '#4ade80', fontSize: 13 }}>✓ {done}</span>
                    <span style={{ color: '#f87171', fontSize: 13 }}>✗ {failed}</span>
                </div>
            )}
        </div>
    );
}
