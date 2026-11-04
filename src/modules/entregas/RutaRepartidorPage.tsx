/**
 * Vista móvil para el repartidor: mapa con su posición GPS en tiempo real (ícono de camión)
 * y lista de stops del día. Acceso por URL directa, sin sidebar.
 * Ruta: /entregas/ruta/:placa?day=YYYY-MM-DD
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Map as LMap, Marker } from 'leaflet';
import { gestionError, mapApi, type MapStop, type RouteData } from '../gestionApi';
import { isoDate } from '@/shared/lib/dates';

const STATUS_COLOR: Record<MapStop['status'], string> = {
    'Pendiente': '#d97706',
    'Entregado': '#16a34a',
    'No entregado': '#dc2626',
};

export function RutaRepartidorPage() {
    const { placa = '' } = useParams<{ placa: string }>();
    const [params] = useSearchParams();
    const day = params.get('day') || isoDate(new Date());

    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LMap | null>(null);
    const gpsMarkerRef = useRef<Marker | null>(null);
    const stopMarkersRef = useRef<Marker[]>([]);

    const [route, setRoute] = useState<RouteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [gpsEnabled, setGpsEnabled] = useState(false);
    const [gpsError, setGpsError] = useState('');

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
        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    // Cargar ruta del servidor
    useEffect(() => {
        if (!placa) return;
        setLoading(true);
        mapApi.getRoute(placa, day)
            .then(r => setRoute(r))
            .catch(e => setError(gestionError(e)))
            .finally(() => setLoading(false));
    }, [placa, day]);

    // Colocar stops en el mapa
    useEffect(() => {
        if (!mapRef.current || !route) return;
        import('leaflet').then(({ default: L }) => {
            const map = mapRef.current!;
            stopMarkersRef.current.forEach(m => m.remove());
            stopMarkersRef.current = [];
            const bounds: [number, number][] = [];

            route.stops.forEach((s, i) => {
                if (s.lat == null || s.lng == null) return;
                const color = STATUS_COLOR[s.status];
                const icon = L.divIcon({
                    className: '',
                    iconAnchor: [14, 14],
                    popupAnchor: [0, -16],
                    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.35)">${i + 1}</div>`,
                });
                const m = L.marker([s.lat, s.lng], { icon })
                    .addTo(map)
                    .bindPopup(`<b>${i + 1}. ${s.client}</b><br>${s.address}<br><span style="color:${color}">${s.status}</span>`);
                stopMarkersRef.current.push(m);
                bounds.push([s.lat, s.lng]);
            });

            if (bounds.length > 0) {
                map.fitBounds(bounds as [number, number][], { padding: [40, 40], maxZoom: 14 });
            }
        });
    }, [route]);

    // GPS en tiempo real
    useEffect(() => {
        if (!gpsEnabled || !mapRef.current) return;
        let watchId: number;
        import('leaflet').then(({ default: L }) => {
            const truckHtml = '<div style="width:36px;height:36px;border-radius:50%;background:#1e293b;border:3px solid #3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.4)">🚚</div>';
            const truckIcon = L.divIcon({ className: '', iconAnchor: [18, 18], html: truckHtml });

            watchId = navigator.geolocation.watchPosition(
                pos => {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    const map = mapRef.current!;
                    if (!gpsMarkerRef.current) {
                        gpsMarkerRef.current = L.marker([lat, lng], { icon: truckIcon, zIndexOffset: 1000 })
                            .addTo(map)
                            .bindPopup('Tu posición actual');
                    } else {
                        gpsMarkerRef.current.setLatLng([lat, lng]);
                    }
                    map.panTo([lat, lng], { animate: true });
                    setGpsError('');
                },
                err => setGpsError(err.message),
                { enableHighAccuracy: true, maximumAge: 5000 },
            );
        });
        return () => {
            navigator.geolocation.clearWatch(watchId);
            gpsMarkerRef.current?.remove();
            gpsMarkerRef.current = null;
        };
    }, [gpsEnabled]);

    const pending = route?.stops.filter(s => s.status === 'Pendiente').length ?? 0;
    const done = route?.stops.filter(s => s.status === 'Entregado').length ?? 0;
    const total = route?.stops.length ?? 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f1f5f9', fontFamily: 'system-ui,sans-serif' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', background: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🚚</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{placa || 'Ruta'}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{route?.driver || ''} · {day}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13 }}>
                    <div style={{ fontWeight: 700 }}>{done}/{total}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>entregas</div>
                </div>
            </div>

            {/* GPS toggle */}
            <div style={{ padding: '8px 16px', background: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                    type="button"
                    onClick={() => setGpsEnabled(v => !v)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                        background: gpsEnabled ? '#3b82f6' : '#334155', color: '#fff' }}
                >
                    {gpsEnabled ? '📍 GPS activo' : '📍 Activar GPS'}
                </button>
                {gpsError && <span style={{ color: '#fca5a5', fontSize: 12 }}>⚠ {gpsError}</span>}
                {!navigator.geolocation && <span style={{ color: '#fca5a5', fontSize: 12 }}>GPS no disponible</span>}
            </div>

            {/* Map */}
            <div ref={containerRef} style={{ flex: 1, minHeight: 220 }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8', zIndex: 999 }}>
                        Cargando…
                    </div>
                )}
            </div>

            {/* Stop list */}
            <div style={{ maxHeight: '35vh', overflowY: 'auto', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                {error && <div style={{ padding: '12px 16px', color: '#dc2626', fontSize: 14 }}>{error}</div>}
                {!loading && total === 0 && !error && (
                    <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
                        Sin entregas para hoy en este vehículo.
                    </div>
                )}
                {route?.stops.map((s, i) => (
                    <div key={s.code} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOR[s.status], color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                            {s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '!' : i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{s.client}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.address || 'Sin dirección'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.code} · <span style={{ color: STATUS_COLOR[s.status] }}>{s.status}</span></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer summary */}
            {total > 0 && (
                <div style={{ padding: '8px 16px', background: '#1e293b', color: '#94a3b8', fontSize: 12, display: 'flex', gap: 16 }}>
                    <span style={{ color: '#fbbf24' }}>⏳ {pending} pendiente(s)</span>
                    <span style={{ color: '#4ade80' }}>✓ {done} entregada(s)</span>
                    <span style={{ color: '#f87171' }}>✗ {total - done - pending} no entregada(s)</span>
                </div>
            )}
        </div>
    );
}
