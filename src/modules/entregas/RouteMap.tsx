import 'leaflet/dist/leaflet.css';
import './entregas.css';
import L from 'leaflet';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Stop } from './entregasLogic';
import { LIMA, roadPath, type LatLng } from './geo';

export interface MapPoint {
    code: string;
    n: number;
    client: string;
    address: string;
    status: Stop['status'];
    ll: LatLng | null;
}

export interface MapRoute {
    vehicle: string;
    color: string;
    warehouse: { name: string; ll: LatLng | null } | null;
    stops: MapPoint[];
}

interface Props {
    routes: MapRoute[];
    /** Placa a mostrar sola; `null` muestra todas. */
    focus?: string | null;
    /** Parada resaltada (la próxima o la elegida en la lista). */
    highlight?: string | null;
    /** Posición del vehículo: GPS, aproximada o simulada. */
    me?: { ll: LatLng; approx: boolean; sim?: boolean } | null;
    /** Tramo actual (de la posición a la próxima parada): se dibuja encima y el resto de la ruta se atenúa. */
    leg?: LatLng[] | null;
    /** Cambiarlo vuelve a encuadrar el mapa. */
    fitKey?: string | number;
    onStopClick?: (code: string, vehicle: string) => void;
    onRouteClick?: (vehicle: string) => void;
    children?: ReactNode;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const HOUSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20H3z"/><path d="M9 20v-6h6v6"/></svg>';

const stopIcon = (p: MapPoint, color: string, big: boolean) => L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div class="rm-pin${big ? ' is-big' : ''} is-${p.status === 'Entregado' ? 'ok' : p.status === 'No entregado' ? 'fail' : 'todo'}" style="--c:${color}">${p.status === 'Entregado' ? '✓' : p.status === 'No entregado' ? '!' : p.n}</div>`,
});

const whIcon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="rm-wh">${HOUSE}</div>` });
const meIcon = L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="rm-me"></div>' });
const TRUCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7"/><circle cx="5.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/></svg>';
const truckIcon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="rm-truck">${TRUCK}</div>` });

export function RouteMap({ routes, focus = null, highlight = null, me = null, leg = null, fitKey = 0, onStopClick, onRouteClick, children }: Props) {
    const elRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const meLayerRef = useRef<L.LayerGroup | null>(null);
    const legLayerRef = useRef<L.LayerGroup | null>(null);
    const fittedRef = useRef('');
    const drawRef = useRef(0);
    const cbRef = useRef({ onStopClick, onRouteClick });
    cbRef.current = { onStopClick, onRouteClick };

    useEffect(() => {
        const map = L.map(elRef.current!, { zoomControl: false }).setView(LIMA, 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        legLayerRef.current = L.layerGroup().addTo(map);
        meLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(elRef.current!);
        return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const layer = layerRef.current;
        if (!map || !layer) return;
        const draw = ++drawRef.current;
        layer.clearLayers();
        const bounds: LatLng[] = [];
        const shownWh = new Set<string>();

        for (const r of routes.filter(x => !focus || x.vehicle === focus)) {
            const path: LatLng[] = [];
            const wh = r.warehouse;
            if (wh?.ll) {
                path.push(wh.ll);
                bounds.push(wh.ll);
                if (!shownWh.has(wh.name)) {
                    shownWh.add(wh.name);
                    L.marker(wh.ll, { icon: whIcon, zIndexOffset: 500 })
                        .bindTooltip(`<b>${esc(wh.name)}</b><br>Almacén de salida`, { direction: 'top', offset: [0, -16] })
                        .addTo(layer);
                }
            }
            for (const p of r.stops) {
                if (!p.ll) continue;
                path.push(p.ll);
                bounds.push(p.ll);
            }
            if (path.length >= 2) {
                const dim = !!leg && r.vehicle === focus;
                const casing = L.polyline(path, { color: '#fff', weight: 8, opacity: dim ? 0.5 : 0.9, interactive: false }).addTo(layer);
                const line = L.polyline(path, { color: r.color, weight: 4.5, opacity: dim ? 0.35 : 0.95, dashArray: '2 9', lineCap: 'round' })
                    .on('click', () => cbRef.current.onRouteClick?.(r.vehicle))
                    .addTo(layer);
                void roadPath(path).then(road => {
                    if (!road || drawRef.current !== draw) return;
                    casing.setLatLngs(road);
                    line.setLatLngs(road);
                    line.setStyle({ dashArray: undefined });
                });
            }
            for (const p of r.stops) {
                if (!p.ll) continue;
                const big = p.code === highlight;
                L.marker(p.ll, { icon: stopIcon(p, r.color, big), zIndexOffset: big ? 1000 : 600 })
                    .bindTooltip(`<b>${p.n}. ${esc(p.client)}</b><br>${esc(p.address)}<br><span class="rm-tip-st">${p.status}</span> · ${esc(r.vehicle)}`, { direction: 'top', offset: [0, -16] })
                    .on('click', () => cbRef.current.onStopClick?.(p.code, r.vehicle))
                    .addTo(layer);
            }
        }

        const key = `${fitKey}|${focus ?? '*'}|${bounds.length}`;
        if (bounds.length && key !== fittedRef.current) {
            fittedRef.current = key;
            map.fitBounds(L.latLngBounds(bounds), { padding: [56, 56], maxZoom: 15 });
        }
    }, [routes, focus, highlight, fitKey, !!leg]);

    useEffect(() => {
        const layer = legLayerRef.current;
        if (!layer) return;
        layer.clearLayers();
        if (!leg || leg.length < 2) return;
        const color = routes.find(r => r.vehicle === focus)?.color ?? '#2563eb';
        L.polyline(leg, { color: '#fff', weight: 11, opacity: 0.95, interactive: false }).addTo(layer);
        L.polyline(leg, { color, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer);
    }, [leg, routes, focus]);

    useEffect(() => {
        const layer = meLayerRef.current;
        if (!layer) return;
        layer.clearLayers();
        if (!me) return;
        if (me.approx && !me.sim) L.circle(me.ll, { radius: 600, color: '#2563eb', weight: 1.5, dashArray: '4 5', fillOpacity: 0.08, interactive: false }).addTo(layer);
        L.marker(me.ll, { icon: me.sim ? truckIcon : meIcon, zIndexOffset: 2000 })
            .bindTooltip(me.sim ? 'Vehículo (simulación)' : me.approx ? 'Ubicación aproximada' : 'Estás aquí', { direction: 'top', offset: [0, -12] })
            .addTo(layer);
    }, [me?.ll[0], me?.ll[1], me?.approx, me?.sim]);

    return (
        <div className="rm">
            <div ref={elRef} className="rm__map" />
            {children}
        </div>
    );
}
