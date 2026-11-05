import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Map as LMap, Marker } from 'leaflet';
import { useDB } from '@/data/store';
import { isoDate } from '@/shared/lib/dates';
import { useDeliveries } from '../gestionApi';
import { dispatchedOn, routeSheet } from './entregasLogic';

const STATUS_COLOR = { 'Pendiente': '#d97706', 'Entregado': '#16a34a', 'No entregado': '#dc2626' };

const mapsUrl = (address: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function RutaRepartidorPage() {
    const { placa = '' } = useParams<{ placa: string }>();
    const [params] = useSearchParams();
    const day = params.get('day') || isoDate(new Date());
    const navigate = useNavigate();

    // Mismo store local que usa EntregasPage
    const d = useDB();
    const orderCodes = dispatchedOn(d.orders, day).map(o => o.code);
    const deliveries = useDeliveries(orderCodes);
    const sheet = routeSheet(d.orders, day, deliveries.data);
    const route = sheet.routes.find(r => r.vehicle === placa);
    const stops = route?.stops ?? [];

    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LMap | null>(null);
    const gpsMarkerRef = useRef<Marker | null>(null);
    const stopMarkersRef = useRef<Marker[]>([]);

    const [gpsEnabled, setGpsEnabled] = useState(false);
    const [gpsError, setGpsError] = useState('');

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

    // Colocar stops geocodificados en el mapa
    useEffect(() => {
        if (!mapRef.current) return;
        import('leaflet').then(({ default: L }) => {
            const map = mapRef.current!;
            stopMarkersRef.current.forEach(m => m.remove());
            stopMarkersRef.current = [];
            const bounds: [number, number][] = [];
            stops.forEach((s, i) => {
                if (s.lat == null || s.lng == null) return;
                const color = STATUS_COLOR[s.status];
                const icon = L.divIcon({
                    className: '',
                    iconAnchor: [14, 14],
                    popupAnchor: [0, -16],
                    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.35)">${s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '!' : i + 1}</div>`,
                });
                const m = L.marker([s.lat, s.lng], { icon })
                    .addTo(map)
                    .bindPopup(`<b>${i + 1}. ${s.client}</b><br>${s.address}<br><span style="color:${color}">${s.status}</span>`);
                stopMarkersRef.current.push(m);
                bounds.push([s.lat, s.lng]);
            });
            if (bounds.length > 0) map.fitBounds(bounds as [number, number][], { padding: [40, 40], maxZoom: 14 });
        });
    }, [stops]);

    // GPS en tiempo real
    useEffect(() => {
        if (!gpsEnabled || !mapRef.current) return;
        let watchId: number;
        import('leaflet').then(({ default: L }) => {
            const truckIcon = L.divIcon({
                className: '',
                iconAnchor: [18, 18],
                html: '<div style="width:36px;height:36px;border-radius:50%;background:#1e293b;border:3px solid #3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.4)">🚚</div>',
            });
            watchId = navigator.geolocation.watchPosition(
                pos => {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    const map = mapRef.current!;
                    if (!gpsMarkerRef.current) {
                        gpsMarkerRef.current = L.marker([lat, lng], { icon: truckIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('Tu posición');
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

    const done = stops.filter(s => s.status === 'Entregado').length;
    const pending = stops.filter(s => s.status === 'Pendiente').length;
    const failed = stops.filter(s => s.status === 'No entregado').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f172a', fontFamily: 'system-ui,sans-serif', isolation: 'isolate' }}>
            {/* Header */}
            <div style={{ padding: '10px 16px', background: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #334155' }}>
                <button type="button" onClick={() => navigate(-1)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#334155', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    ‹
                </button>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🚚</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.02em' }}>{placa || 'Ruta'}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{route?.driver || 'Sin conductor'} · {day}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: done === stops.length && stops.length > 0 ? '#4ade80' : '#fff' }}>{done}/{stops.length}</div>
                    <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>entregas</div>
                </div>
            </div>

            {/* GPS bar */}
            <div style={{ padding: '8px 16px', background: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1e293b' }}>
                <button type="button" onClick={() => setGpsEnabled(v => !v)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                        background: gpsEnabled ? '#3b82f6' : '#1e293b', color: gpsEnabled ? '#fff' : '#94a3b8',
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
                    <span style={{ fontSize: 14 }}>{gpsEnabled ? '📍' : '📍'}</span>
                    {gpsEnabled ? 'GPS activo' : 'Activar GPS'}
                </button>
                {gpsError && <span style={{ color: '#fca5a5', fontSize: 12 }}>⚠ {gpsError}</span>}
                {typeof navigator !== 'undefined' && !navigator.geolocation &&
                    <span style={{ color: '#fca5a5', fontSize: 12 }}>GPS no disponible en este navegador</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>{pending > 0 ? `${pending} pendiente${pending > 1 ? 's' : ''}` : done === stops.length && stops.length > 0 ? '✓ Ruta completa' : ''}</span>
            </div>

            {/* Map */}
            <div style={{ flex: '0 0 42vh', minHeight: 180, position: 'relative' }}>
                <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
                {stops.length > 0 && stops.every(s => s.lat == null) && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(15,23,42,.85)', color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 24, zIndex: 10 }}>
                        Las paradas no tienen coordenadas geocodificadas aún.<br />
                        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Usa los links de Google Maps abajo para navegar.</span>
                    </div>
                )}
            </div>

            {/* Stop list */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
                {!deliveries.ready && (
                    <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>Cargando confirmaciones…</div>
                )}
                {deliveries.ready && stops.length === 0 && (
                    <div style={{ padding: '24px 16px', color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                        Sin entregas asignadas a {placa} para hoy.
                    </div>
                )}
                {stops.map((s, i) => (
                    <div key={s.code} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: STATUS_COLOR[s.status], color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                            {s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '!' : i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{s.client}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.address || 'Sin dirección'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                {s.code}
                                {s.guide && <span> · Guía {s.guide}</span>}
                                <span style={{ color: STATUS_COLOR[s.status], marginLeft: 6 }}>· {s.status}</span>
                            </div>
                            {s.delivery?.status === 'Entregado' && (
                                <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>Recibió: {s.delivery.receiver}</div>
                            )}
                            {s.delivery?.status === 'No entregado' && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>{s.delivery.reason}</div>
                            )}
                        </div>
                        {/* Abrir en Google Maps */}
                        {s.address && (
                            <a href={mapsUrl(s.address)} target="_blank" rel="noopener noreferrer"
                                style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, background: '#f1f5f9', color: '#3b82f6',
                                    fontSize: 18, textDecoration: 'none', display: 'flex', alignItems: 'center', marginTop: 2 }}
                                title="Abrir en Google Maps">
                                🗺
                            </a>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            {stops.length > 0 && (
                <div style={{ padding: '10px 16px', background: '#1e293b', display: 'flex', gap: 20, justifyContent: 'center' }}>
                    <span style={{ color: '#fbbf24', fontSize: 13 }}>⏳ {pending}</span>
                    <span style={{ color: '#4ade80', fontSize: 13 }}>✓ {done}</span>
                    <span style={{ color: '#f87171', fontSize: 13 }}>✗ {failed}</span>
                </div>
            )}
        </div>
    );
}
