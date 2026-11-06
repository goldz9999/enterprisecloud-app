import { useEffect, useMemo, useRef, useState } from 'react';
import { deliveriesApi, gestionError } from '../gestionApi';
import type { Route, Stop } from './entregasLogic';
import { distanceKm, pathAfter, pathMeters, pointAlong, roadRoute, type LatLng, type RoadRoute } from './geo';
import type { MapRoute } from './RouteMap';

/** La simulación dura como máximo 5 minutos aunque el viaje real sea más largo. */
const SIM_MAX_MS = 5 * 60 * 1000;
const SIM_MIN_MS = 15 * 1000;
/** A esta distancia de la parada se considera que el vehículo llegó. */
const ARRIVAL_KM = 0.12;
/** Sin servicio de rutas: línea recta a 25 km/h de promedio en ciudad. */
const CITY_MPS = 25000 / 3600;

interface Sim { code: string; path: LatLng[]; meters: number; realSec: number; durMs: number; start: number }

export type Gps = { state: 'apagado' } | { state: 'buscando' } | { state: 'ok'; ll: LatLng } | { state: 'off'; reason: string };

function useGps(enabled: boolean, attempt: number): Gps {
    const [gps, setGps] = useState<Gps>({ state: enabled ? 'buscando' : 'apagado' });
    useEffect(() => {
        if (!enabled) { setGps({ state: 'apagado' }); return; }
        if (!('geolocation' in navigator)) { setGps({ state: 'off', reason: 'Este dispositivo no tiene GPS' }); return; }
        setGps({ state: 'buscando' });
        let got = false;
        const timer = setTimeout(() => { if (!got) setGps({ state: 'off', reason: 'El GPS no responde' }); }, 15000);
        const id = navigator.geolocation.watchPosition(
            p => { got = true; setGps({ state: 'ok', ll: [p.coords.latitude, p.coords.longitude] }); },
            e => setGps({ state: 'off', reason: e.code === e.PERMISSION_DENIED ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación' }),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => { clearTimeout(timer); navigator.geolocation.clearWatch(id); };
    }, [enabled, attempt]);
    return gps;
}

/** Recorrido por calles de `from` a `to`; se recalcula al cambiar el destino o al moverse unos 100 m. */
function useLeg(from: LatLng | null, to: LatLng | null): RoadRoute | null {
    const [leg, setLeg] = useState<RoadRoute | null>(null);
    const key = from && to ? `${from[0].toFixed(3)},${from[1].toFixed(3)}>${to[0]},${to[1]}` : '';
    useEffect(() => {
        if (!from || !to) { setLeg(null); return; }
        let alive = true;
        void roadRoute([from, to]).then(r => {
            if (!alive) return;
            const meters = distanceKm(from, to) * 1000;
            setLeg(r ?? { path: [from, to], meters, seconds: meters / CITY_MPS });
        });
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return leg;
}

const WHY = {
    already_delivered: 'ya estaba entregado',
    already_notified: 'el cliente ya había sido avisado',
    no_email: 'el cliente no tiene correo registrado',
    smtp_disabled: 'los correos están desactivados',
} as const;

/**
 * Navegación de un vehículo hacia su próxima parada: posición (GPS, aproximada o simulada), tramo y llegada
 * estimada, aviso de llegada al cliente y simulación del recorrido. Con `useDeviceGps` en falso no pide ubicación.
 */
export function useNavigation({ route, stops, mapRoute, useDeviceGps, notify }: {
    route: Route | null;
    /** Paradas del vehículo en orden de visita. */
    stops: Stop[];
    mapRoute: MapRoute | undefined;
    useDeviceGps: boolean;
    notify: (msg: string) => void;
}) {
    const [attempt, setAttempt] = useState(0);
    const gps = useGps(useDeviceGps && !!route, attempt);

    const llOf = (code: string) => mapRoute?.stops.find(s => s.code === code)?.ll ?? null;
    const next = stops.find(s => s.status === 'Pendiente') ?? null;
    const nextLl = next ? llOf(next.code) : null;
    const done = stops.filter(s => s.status !== 'Pendiente');
    const later = stops.filter(s => s.status === 'Pendiente' && s !== next);

    // Sin GPS: posición estimada en la última entrega marcada, o en el almacén si aún no sale.
    const lastDone = done.filter(s => s.delivery && llOf(s.code)).sort((a, b) => (b.delivery!.at > a.delivery!.at ? 1 : -1))[0];
    const approxLl = lastDone ? llOf(lastDone.code) : mapRoute?.warehouse?.ll ?? null;
    const approxFrom = lastDone ? 'la última entrega' : 'el almacén';
    const meLl = gps.state === 'ok' ? gps.ll : approxLl;

    // ── Simulación ──
    const [sim, setSim] = useState<Sim | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [simLoading, setSimLoading] = useState(false);
    const progress = sim ? Math.min(1, (now - sim.start) / sim.durMs) : 0;
    const simLl = sim ? pointAlong(sim.path, sim.meters * progress) : null;
    useEffect(() => {
        if (!sim || progress >= 1) return;
        const t = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(t);
    }, [sim, progress >= 1]);
    // Al marcar la entrega (o cambiar de vehículo) la simulación termina y se pasa a la siguiente parada.
    useEffect(() => { if (sim && sim.code !== next?.code) setSim(null); }, [next?.code]);

    const posLl = simLl ?? meLl;
    const me = useMemo(
        () => (posLl && route ? { ll: posLl, approx: !sim && gps.state !== 'ok', sim: !!sim } : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [posLl?.[0], posLl?.[1], gps.state, !!sim, !!route],
    );
    const leg = useLeg(sim || !route ? null : meLl, nextLl);
    const km = posLl && nextLl ? distanceKm(posLl, nextLl) : null;

    // ── Llegada: por GPS (a menos de 120 m) o al terminar la simulación ──
    const arrivedRef = useRef(new Set<string>());
    const [arrived, setArrived] = useState<string | null>(null);
    const arrive = async (s: Stop) => {
        if (!route || arrivedRef.current.has(s.code)) return;
        arrivedRef.current.add(s.code);
        setArrived(s.code);
        try {
            const res = await deliveriesApi.arrival(s.code, { vehicle: route.vehicle, driver: route.driver || undefined });
            notify(res.emailed ? `${route.vehicle} llegó a ${s.client} · avisamos al cliente por correo` : `${route.vehicle} llegó a ${s.client} · sin correo: ${WHY[res.reason!]}`);
        } catch (e) {
            arrivedRef.current.delete(s.code);
            notify(gestionError(e));
        }
    };
    useEffect(() => {
        if (next && sim?.code === next.code && progress >= 1) void arrive(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progress >= 1, sim?.code]);
    useEffect(() => {
        if (!sim && next && gps.state === 'ok' && nextLl && distanceKm(gps.ll, nextLl) <= ARRIVAL_KM) void arrive(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gps.state === 'ok' ? gps.ll.join() : '', next?.code, nextLl?.join()]);

    // La simulación parte de la última entrega o del almacén, no del GPS real del dispositivo.
    const simFrom = approxLl;
    const startSim = async () => {
        if (!next || !nextLl || !simFrom) return;
        setSimLoading(true);
        const r = await roadRoute([simFrom, nextLl]);
        setSimLoading(false);
        const path = r?.path ?? [simFrom, nextLl];
        const meters = pathMeters(path);
        const realSec = r?.seconds ?? meters / CITY_MPS;
        arrivedRef.current.delete(next.code);
        setArrived(null);
        setNow(Date.now());
        setSim({ code: next.code, path, meters, realSec, durMs: Math.min(SIM_MAX_MS, Math.max(SIM_MIN_MS, realSec * 1000)), start: Date.now() });
    };

    return {
        gps, retryGps: () => setAttempt(a => a + 1), approxLl, approxFrom,
        next, nextLl, done, later, llOf,
        // Solo lo que falta recorrer: lo ya andado desaparece del mapa.
        me, leg: sim ? pathAfter(sim.path, sim.meters * progress) : leg?.path ?? null, km,
        etaSec: sim ? sim.realSec * (1 - progress) : leg?.seconds ?? null,
        etaKm: sim ? (sim.meters * (1 - progress)) / 1000 : leg ? leg.meters / 1000 : km,
        isHere: !!next && arrived === next.code,
        simulating: !!sim, progress, simLoading, canSimulate: !!(next && nextLl && simFrom),
        startSim, skipSim: () => setSim(sm => (sm ? { ...sm, start: Date.now() - sm.durMs } : sm)), stopSim: () => setSim(null),
    };
}

export type Navigation = ReturnType<typeof useNavigation>;

export const minutes = (sec: number) => Math.max(1, Math.round(sec / 60));
export const clockIn = (sec: number) => new Date(Date.now() + sec * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
