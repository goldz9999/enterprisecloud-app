import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { can } from '@/data/permissions';
import { useDB } from '@/data/store';
import { Toast, useToast } from '@/shared/components/Toast';
import { isoDate, parseDate } from '@/shared/lib/dates';
import { deliveriesApi, gestionError, useDeliveries, useRouteDepartures } from '../gestionApi';
import { shortDay } from '../ui';
import { dispatchedOn, routeSheet, type Stop } from './entregasLogic';
import { distanceKm, navigateUrl, pathMeters, pointAlong, roadRoute, type LatLng, type RoadRoute } from './geo';
import { MarkDeliveryModal } from './MarkDeliveryModal';
import { RouteMap } from './RouteMap';
import { departureTime, StartRouteModal } from './StartRouteModal';
import { useMapRoutes } from './useMapRoutes';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const NAV = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-8-8 18-2-8z" /></svg>;
const CHECK = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const TARGET = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;

/** La simulación dura como máximo 5 minutos aunque el viaje real sea más largo. */
const SIM_MAX_MS = 5 * 60 * 1000;
const SIM_MIN_MS = 15 * 1000;
/** A esta distancia de la parada se considera que el vehículo llegó. */
const ARRIVAL_KM = 0.12;

const minutes = (sec: number) => Math.max(1, Math.round(sec / 60));
const clock = (sec: number) => new Date(Date.now() + sec * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

interface Sim { code: string; path: LatLng[]; meters: number; realSec: number; durMs: number; start: number }

/** Recorrido por calles de `from` a `to`; se recalcula al cambiar el destino o al moverse unos 100 m. */
function useLeg(from: LatLng | null, to: LatLng | null): RoadRoute | null {
    const [leg, setLeg] = useState<RoadRoute | null>(null);
    const key = from && to ? `${from[0].toFixed(3)},${from[1].toFixed(3)}>${to[0]},${to[1]}` : '';
    useEffect(() => {
        if (!from || !to) { setLeg(null); return; }
        let alive = true;
        void roadRoute([from, to]).then(r => {
            if (!alive) return;
            // Sin servicio de rutas: línea recta a 25 km/h de promedio en ciudad.
            const meters = distanceKm(from, to) * 1000;
            setLeg(r ?? { path: [from, to], meters, seconds: meters / (25000 / 3600) });
        });
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return leg;
}

type Gps = { state: 'buscando' } | { state: 'ok'; ll: LatLng } | { state: 'off'; reason: string };

function useGps(attempt: number): Gps {
    const [gps, setGps] = useState<Gps>({ state: 'buscando' });
    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGps({ state: 'off', reason: 'Este dispositivo no tiene GPS' });
            return;
        }
        setGps({ state: 'buscando' });
        let got = false;
        const timer = setTimeout(() => { if (!got) setGps({ state: 'off', reason: 'El GPS no responde' }); }, 15000);
        const id = navigator.geolocation.watchPosition(
            p => { got = true; setGps({ state: 'ok', ll: [p.coords.latitude, p.coords.longitude] }); },
            e => setGps({ state: 'off', reason: e.code === e.PERMISSION_DENIED ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación' }),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => { clearTimeout(timer); navigator.geolocation.clearWatch(id); };
    }, [attempt]);
    return gps;
}

export function RutaRepartidorPage() {
    const { placa = '' } = useParams<{ placa: string }>();
    const [params] = useSearchParams();
    const day = params.get('day') || isoDate(new Date());
    const d = useDB();
    const toast = useToast();
    const canEdit = can(d, 'Órdenes de venta', 'Editar');

    const deliveries = useDeliveries(dispatchedOn(d.orders, day).map(o => o.code));
    const sheet = routeSheet(d.orders, day, deliveries.data);
    const route = sheet.routes.find(r => r.vehicle === placa);
    const { mapRoutes, pending, inVisitOrder } = useMapRoutes(sheet.routes, d.records.almacenes, placa);
    const stops = route ? inVisitOrder(route) : [];
    const mine = mapRoutes.find(r => r.vehicle === placa);
    const color = mine?.color ?? 'var(--accent)';

    const [attempt, setAttempt] = useState(0);
    const gps = useGps(attempt);
    const [fitKey, setFitKey] = useState(0);
    const [marking, setMarking] = useState<Stop | null>(null);
    const departures = useRouteDepartures(day);
    const departed = departures.data[placa];
    const [starting, setStarting] = useState(false);

    const llOf = (code: string) => mine?.stops.find(s => s.code === code)?.ll ?? null;
    const next = stops.find(s => s.status === 'Pendiente');
    const nextLl = next ? llOf(next.code) : null;
    const done = stops.filter(s => s.status !== 'Pendiente');
    const later = stops.filter(s => s.status === 'Pendiente' && s !== next);
    const ok = stops.filter(s => s.status === 'Entregado').length;

    // Sin GPS: se estima la posición en la última entrega marcada, o en el almacén si aún no sale.
    const lastDone = [...done].filter(s => s.delivery && llOf(s.code)).sort((a, b) => (b.delivery!.at > a.delivery!.at ? 1 : -1))[0];
    const approxLl = lastDone ? llOf(lastDone.code) : mine?.warehouse?.ll ?? null;
    const approxFrom = lastDone ? 'tu última entrega' : 'el almacén';
    const meLl = gps.state === 'ok' ? gps.ll : approxLl;

    // ── Simulación del recorrido hasta la próxima parada ──
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
    // Al marcar la entrega, la simulación termina y se pasa a la siguiente parada.
    useEffect(() => { if (sim && sim.code !== next?.code) setSim(null); }, [next?.code]);

    const posLl = simLl ?? meLl;
    const me = useMemo(
        () => (posLl ? { ll: posLl, approx: !sim && gps.state !== 'ok', sim: !!sim } : null),
        [posLl?.[0], posLl?.[1], gps.state, !!sim],
    );
    const km = posLl && nextLl ? distanceKm(posLl, nextLl) : null;
    const leg = useLeg(sim ? null : meLl, nextLl);

    // ── Llegada: por GPS (a menos de 120 m) o al terminar la simulación ──
    const arrivedRef = useRef(new Set<string>());
    const [arrived, setArrived] = useState<string | null>(null);
    const arrive = async (s: Stop) => {
        if (arrivedRef.current.has(s.code)) return;
        arrivedRef.current.add(s.code);
        setArrived(s.code);
        try {
            const res = await deliveriesApi.arrival(s.code, { vehicle: placa, driver: route?.driver || undefined });
            const why = { already_delivered: 'ya estaba entregado', already_notified: 'el cliente ya había sido avisado', no_email: 'el cliente no tiene correo registrado', smtp_disabled: 'los correos están desactivados' } as const;
            toast.flash(res.emailed ? `Llegaste a ${s.client} · avisamos al cliente por correo` : `Llegaste a ${s.client} · sin correo: ${why[res.reason!]}`);
        } catch (e) {
            arrivedRef.current.delete(s.code);
            toast.flash(gestionError(e));
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

    // La simulación parte de la última entrega o del almacén (no del GPS real del dispositivo).
    const simFrom = lastDone ? llOf(lastDone.code) : mine?.warehouse?.ll ?? null;
    const startSim = async () => {
        if (!next || !nextLl || !simFrom) return;
        setSimLoading(true);
        const r = await roadRoute([simFrom, nextLl]);
        setSimLoading(false);
        const path = r?.path ?? [simFrom, nextLl];
        const meters = pathMeters(path);
        const realSec = r?.seconds ?? meters / (25000 / 3600);
        arrivedRef.current.delete(next.code);
        setArrived(null);
        setNow(Date.now());
        setSim({ code: next.code, path, meters, realSec, durMs: Math.min(SIM_MAX_MS, Math.max(SIM_MIN_MS, realSec * 1000)), start: Date.now() });
    };
    const skipSim = () => setSim(sm => (sm ? { ...sm, start: Date.now() - sm.durMs } : sm));
    const etaSec = sim ? sim.realSec * (1 - progress) : leg?.seconds ?? null;
    const etaKm = sim ? (sim.meters * (1 - progress)) / 1000 : leg ? leg.meters / 1000 : km;
    const isHere = !!next && arrived === next.code;

    const client = (name: string) => d.records.clientes.find(c => c.razon === name);
    const nextClient = next ? client(next.client) : undefined;
    const date = parseDate(day) ?? new Date();

    const numStyle = { '--c': color } as CSSProperties;
    const stopNumber = (s: Stop) => stops.indexOf(s) + 1;

    return (
        <div className="drv">
            <header className="drv__top">
                <div className="drv__row">
                    <Link to="/entregas" className="drv__back" aria-label="Volver a la hoja de ruta">‹</Link>
                    <div style={{ minWidth: 0 }}>
                        <div className="drv__plate">{placa}</div>
                        <div className="drv__sub">{route?.driver || 'Sin conductor'} · {DIAS[date.getDay()]} {shortDay(day)}{departed ? ` · en ruta desde ${departureTime(departed.startedAt)}` : ''}</div>
                    </div>
                    <div className="drv__count"><b>{ok}/{stops.length}</b><span>entregas</span></div>
                </div>
                <div className="drv__bar"><i style={{ width: `${stops.length ? (done.length / stops.length) * 100 : 0}%`, background: color }} /></div>
            </header>

            <div className="drv__map">
                <RouteMap routes={mapRoutes} focus={placa} highlight={next?.code ?? null} me={me} leg={sim ? sim.path : leg?.path ?? null} fitKey={fitKey}>
                    {sim ? (
                        <div className="rm-float rm-card drv-banner">
                            <span className="drv-banner__dot" style={{ background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-bg)' }} />
                            {progress >= 1 ? 'Simulación · el vehículo llegó a destino' : `Simulación · llega en ${minutes(etaSec ?? 0)} min`}
                        </div>
                    ) : stops.length > 0 && (gps.state === 'ok' ? (
                        <div className="rm-float rm-card drv-banner">
                            <span className="drv-banner__dot" />
                            {km != null ? `GPS activo · a ${km.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km de la próxima parada` : 'GPS activo'}
                        </div>
                    ) : gps.state === 'off' ? (
                        <div className="rm-float rm-card drv-banner is-warn">
                            <span>⚠ {gps.reason}{approxLl ? ` · posición estimada en ${approxFrom}` : ''}</span>
                            <button type="button" className="drv-banner__act" onClick={() => setAttempt(a => a + 1)}>Reintentar</button>
                        </div>
                    ) : (
                        <div className="rm-float rm-card drv-banner">Buscando tu ubicación…</div>
                    ))}
                    {pending > 0 && <div className="rm-float rm-card" style={{ left: 12, bottom: 30, padding: '6px 10px' }}>Ubicando direcciones…</div>}
                    <button type="button" className="rm-float drv-fab" onClick={() => setFitKey(k => k + 1)} aria-label="Ver toda la ruta">{TARGET}</button>
                </RouteMap>
            </div>

            <section className="drv-sheet">
                <div className="drv-sheet__grab" />
                {!route ? (
                    <div className="drv-done"><b>Sin entregas</b><span>{placa} no tiene ventas despachadas para el {shortDay(day)}.</span></div>
                ) : next ? (
                    <>
                        {!departed && departures.ready && canEdit && (
                            <>
                                <button type="button" className="drv-depart" onClick={() => setStarting(true)}>Salir a ruta</button>
                                <p className="drv-depart-note">Avisa «en camino» a tus clientes por correo</p>
                            </>
                        )}
                        <div className="drv-label">Próxima parada · {stopNumber(next)} de {stops.length}</div>
                        <div className="drv-next">
                            <span className="drv-next__n" style={numStyle}>{stopNumber(next)}</span>
                            <div style={{ minWidth: 0 }}>
                                <div className="drv-next__client">{next.client}</div>
                                <div className="drv-next__addr">{next.address || 'Sin dirección'}</div>
                                <div className="drv-next__meta">{next.code} · {next.items}</div>
                            </div>
                        </div>
                        {nextLl && etaSec != null && (
                            isHere ? (
                                <div className="drv-eta is-here"><span>Llegaste a destino{sim ? ' (simulación)' : ''}. Marca la entrega cuando la recibas.</span></div>
                            ) : (
                                <div className="drv-eta">
                                    <span>Llegada aprox.</span>
                                    <b>{clock(etaSec)}</b>
                                    <span>· {minutes(etaSec)} min · {(etaKm ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} km{sim ? ' · simulado' : ''}</span>
                                </div>
                            )
                        )}
                        {nextLl && simFrom && (
                            sim ? (
                                <>
                                    <div className="drv-sim__bar"><i style={{ width: `${progress * 100}%` }} /></div>
                                    <div className="drv-sim">
                                        <button type="button" className="drv-sim__btn" onClick={() => setSim(null)}>Detener simulación</button>
                                        {progress < 1 && <button type="button" className="drv-sim__btn is-skip" onClick={skipSim}>Saltar · llegar ya</button>}
                                    </div>
                                </>
                            ) : (
                                <div className="drv-sim">
                                    <button type="button" className="drv-sim__btn" disabled={simLoading} onClick={() => void startSim()}>{simLoading ? 'Calculando ruta…' : '▶ Simular ruta'}</button>
                                </div>
                            )
                        )}
                        <div className="drv-actions">
                            <a className="drv-btn drv-btn--go" href={navigateUrl(next.address, nextLl)} target="_blank" rel="noopener noreferrer">{NAV} Navegar</a>
                            {canEdit
                                ? <button type="button" className="drv-btn drv-btn--mark" onClick={() => setMarking(next)}>{CHECK} Marcar entrega</button>
                                : <span className="drv-btn drv-btn--mark" style={{ opacity: .5 }}>Sin permiso</span>}
                        </div>
                        {nextClient && (nextClient.contacto || nextClient.tel) && (
                            <div className="drv-contact">
                                <span>Contacto: <b style={{ color: 'var(--text)' }}>{String(nextClient.contacto || nextClient.razon)}</b></span>
                                {nextClient.tel && <a href={`tel:${String(nextClient.tel).replace(/\s/g, '')}`}>{String(nextClient.tel)}</a>}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="drv-done"><b>Ruta terminada</b><span>{ok} entregada(s){done.length - ok ? ` · ${done.length - ok} no entregada(s)` : ''}</span></div>
                )}

                {later.length > 0 && <div className="drv-group">Después</div>}
                {later.map(s => (
                    <div key={s.code} className="drv-item">
                        <span className="rp-stop__n" style={numStyle}>{stopNumber(s)}</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="drv-item__client">{s.client}</div>
                            <div className="drv-item__addr">{s.address}</div>
                        </div>
                        <a className="drv-item__go" href={navigateUrl(s.address, llOf(s.code))} target="_blank" rel="noopener noreferrer">Ir</a>
                    </div>
                ))}

                {done.length > 0 && <div className="drv-group">Completadas</div>}
                {done.map(s => (
                    <div key={s.code} className="drv-item" onClick={() => canEdit && setMarking(s)} style={{ cursor: canEdit ? 'pointer' : undefined }}>
                        <span className={'rp-stop__n ' + (s.status === 'Entregado' ? 'is-ok' : 'is-fail')}>{s.status === 'Entregado' ? '✓' : '!'}</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="drv-item__client">{s.client}</div>
                            <div className="drv-item__addr">{s.status === 'Entregado' ? `Recibió ${s.delivery?.receiver ?? ''}` : s.delivery?.reason}</div>
                        </div>
                        {canEdit && <span className="drv-item__go">Cambiar</span>}
                    </div>
                ))}
            </section>

            {marking && (
                <MarkDeliveryModal
                    stop={marking}
                    onClose={() => setMarking(null)}
                    onSaved={async msg => { await deliveries.reload(); toast.flash(msg); }}
                    onError={toast.flash}
                />
            )}
            {starting && route && (
                <StartRouteModal
                    vehicle={placa}
                    driver={route.driver}
                    day={day}
                    stops={stops}
                    onClose={() => setStarting(false)}
                    onStarted={async msg => { await departures.reload(); toast.flash(msg); }}
                    onError={toast.flash}
                />
            )}
            <Toast message={toast.message} />
        </div>
    );
}
