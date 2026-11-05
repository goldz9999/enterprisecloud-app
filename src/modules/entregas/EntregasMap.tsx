import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as LMap, Marker, TileLayer } from 'leaflet';
import { gestionError, mapApi, type MapData, type MapStop } from '../gestionApi';

/** Color por vehículo (hasta 10 vehículos distintos) */
const VEHICLE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#ea580c', '#65a30d', '#0d9488'];
const colorFor = (() => {
    const cache = new Map<string, string>();
    let idx = 0;
    return (plate: string) => {
        if (!cache.has(plate)) cache.set(plate, VEHICLE_COLORS[idx++ % VEHICLE_COLORS.length]);
        return cache.get(plate)!;
    };
})();

const statusIcon = (status: MapStop['status']): string =>
    status === 'Entregado' ? '✓' : status === 'No entregado' ? '!' : '·';

function makeDivIcon(L: typeof import('leaflet'), plate: string, status: MapStop['status'], label: string | number) {
    const color = status === 'Entregado' ? '#16a34a' : status === 'No entregado' ? '#dc2626' : colorFor(plate);
    const icon = statusIcon(status);
    return L.divIcon({
        className: '',
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.35)">${icon !== '·' ? icon : label}</div>`,
    });
}

function makeWarehouseIcon(L: typeof import('leaflet')) {
    return L.divIcon({
        className: '',
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
        html: '<div style="width:28px;height:28px;border-radius:4px;background:#1e293b;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.35)">🏭</div>',
    });
}

function stopPopup(s: MapStop): string {
    const warn = s.zones.length > 0 && !s.zones.some(z => s.address.toLowerCase().includes(z.toLowerCase()))
        ? `<div style="margin-top:4px;color:#d97706;font-size:11px">⚠ Fuera de zona: ${s.zones.join(', ')}</div>` : '';
    return `<b>${s.code}</b> · ${s.client}<br><span style="font-size:12px;color:#64748b">${s.address}</span>
<div style="margin-top:4px;font-size:12px"><b>Vehículo:</b> ${s.vehicle} · <b>Conductor:</b> ${s.driver || '—'}</div>
<div style="font-size:12px"><b>Estado:</b> ${s.status}</div>${warn}`;
}

interface EntregasMapProps {
    day: string;
    onGeocodeRequest?: (code: string) => Promise<void>;
}

export function EntregasMap({ day, onGeocodeRequest }: EntregasMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LMap | null>(null);
    const markersRef = useRef<Marker[]>([]);
    const tileRef = useRef<TileLayer | null>(null);
    const [data, setData] = useState<MapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [geocodingCode, setGeocodingCode] = useState('');
    const [missingCoords, setMissingCoords] = useState<MapStop[]>([]);

    // Inicializar mapa una vez
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        import('leaflet').then(({ default: L }) => {
            const map = L.map(containerRef.current!, { zoomControl: true }).setView([-12.046374, -77.042793], 11);
            tileRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(map);
            mapRef.current = map;
        });
        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    // Recargar datos cuando cambia el día
    useEffect(() => {
        if (!day) return;
        setLoading(true);
        setError('');
        mapApi.getMap(day)
            .then(d => {
                setData(d);
                setMissingCoords(d.stops.filter(s => s.lat == null || s.lng == null));
            })
            .catch(e => setError(gestionError(e)))
            .finally(() => setLoading(false));
    }, [day]);

    // Actualizar marcadores cuando llegan datos
    useEffect(() => {
        if (!mapRef.current || !data) return;
        import('leaflet').then(({ default: L }) => {
            const map = mapRef.current!;
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            const bounds: [number, number][] = [];

            // Almacenes
            data.warehouses.forEach(w => {
                if (w.lat == null || w.lng == null) return;
                const m = L.marker([w.lat, w.lng], { icon: makeWarehouseIcon(L) })
                    .addTo(map)
                    .bindPopup(`<b>🏭 ${w.name}</b>${w.address ? `<br><span style="font-size:12px">${w.address}</span>` : ''}`);
                markersRef.current.push(m);
                bounds.push([w.lat, w.lng]);
            });

            // Stops de entrega
            data.stops.forEach((s, i) => {
                if (s.lat == null || s.lng == null) return;
                const m = L.marker([s.lat, s.lng], { icon: makeDivIcon(L, s.vehicle, s.status, i + 1) })
                    .addTo(map)
                    .bindPopup(stopPopup(s));
                markersRef.current.push(m);
                bounds.push([s.lat, s.lng]);
            });

            if (bounds.length > 0) {
                map.fitBounds(bounds as [number, number][], { padding: [30, 30], maxZoom: 14 });
            }
        });
    }, [data]);

    const geocodeStop = async (code: string) => {
        if (!onGeocodeRequest) return;
        setGeocodingCode(code);
        try {
            await onGeocodeRequest(code);
            // Recargar datos
            const d = await mapApi.getMap(day);
            setData(d);
            setMissingCoords(d.stops.filter(s => s.lat == null || s.lng == null));
        } catch {
            /* noop */
        } finally {
            setGeocodingCode('');
        }
    };

    return (
        <div className="entregas-map-wrap" style={{ isolation: 'isolate' }}>
            {loading && <div className="entregas-map-banner">Cargando mapa…</div>}
            {error && <div className="entregas-map-banner entregas-map-banner--err">{error}</div>}
            <div ref={containerRef} className="entregas-map" style={{ height: 440, background: '#e8e8e8' }} />
            {missingCoords.length > 0 && (
                <div className="entregas-map-missing">
                    <span className="muted" style={{ fontSize: 12.5 }}>Sin coordenadas ({missingCoords.length}):</span>
                    {missingCoords.map(s => (
                        <button
                            key={s.code}
                            type="button"
                            className="filter-chip"
                            disabled={geocodingCode === s.code}
                            onClick={() => void geocodeStop(s.code)}
                            title={s.address}
                        >
                            {geocodingCode === s.code ? '…' : '📍'} {s.code}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
