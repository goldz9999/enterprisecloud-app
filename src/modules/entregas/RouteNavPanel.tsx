import type { CSSProperties } from 'react';
import type { Row } from '@/data/types';
import type { RouteDeparture } from '../gestionApi';
import type { Route, Stop } from './entregasLogic';
import { navigateUrl } from './geo';
import { departureTime } from './StartRouteModal';
import { clockIn, minutes, type Navigation } from './useNavigation';

const NAV = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-8-8 18-2-8z" /></svg>;
const CHECK = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

interface Props {
    route: Route;
    /** Paradas en orden de visita. */
    stops: Stop[];
    color: string;
    nav: Navigation;
    departure: RouteDeparture | undefined;
    departuresReady: boolean;
    canEdit: boolean;
    clients: Row[];
    vehicleInfo: string;
    /** Volver a la lista de todas las rutas (no se muestra a un repartidor). */
    onBack?: () => void;
    onStart: () => void;
    onMark: (s: Stop) => void;
}

/** Panel de un vehículo: próxima parada, llegada estimada, simulación y el resto de sus paradas. */
export function RouteNavPanel({ route, stops, color, nav, departure, departuresReady, canEdit, clients, vehicleInfo, onBack, onStart, onMark }: Props) {
    const { next, nextLl, later, done } = nav;
    const ok = stops.filter(s => s.status === 'Entregado').length;
    const numStyle = { '--c': color } as CSSProperties;
    const n = (s: Stop) => stops.indexOf(s) + 1;
    const client = next ? clients.find(c => c.razon === next.client) : undefined;

    return (
        <div className="rp-nav">
            <div className="rp-nav__head">
                {onBack && <button type="button" className="rp-nav__back" onClick={onBack} aria-label="Ver todas las rutas">‹</button>}
                <span className="rp-route__bar" style={{ background: color }} />
                <div style={{ minWidth: 0 }}>
                    <div className="rp-route__plate">{route.vehicle}</div>
                    <div className="rp-route__sub">{[route.driver || 'Sin conductor', vehicleInfo].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="rp-prog">
                    {ok}/{stops.length}
                    <div className="rp-prog__bar"><i style={{ width: `${stops.length ? (done.length / stops.length) * 100 : 0}%`, background: color }} /></div>
                </div>
            </div>

            <div className="rp-nav__body">
                {departure
                    ? <span className="rp-depart" title={`Registró ${departure.startedBy}`}>En ruta desde {departureTime(departure.startedAt)}</span>
                    : next && departuresReady && canEdit && (
                        <button type="button" className="drv-depart" onClick={onStart}>Salir a ruta <small>· avisa «en camino» por correo</small></button>
                    )}

                {next ? (
                    <>
                        <div className="drv-label">Próxima parada · {n(next)} de {stops.length}</div>
                        <div className="drv-next">
                            <span className="drv-next__n" style={numStyle}>{n(next)}</span>
                            <div style={{ minWidth: 0 }}>
                                <div className="drv-next__client">{next.client}</div>
                                <div className="drv-next__addr">{next.address || 'Sin dirección'}</div>
                                <div className="drv-next__meta">{next.code} · {next.items}</div>
                            </div>
                        </div>

                        {nextLl && nav.etaSec != null && (nav.isHere ? (
                            <div className="drv-eta is-here"><span>Llegó a destino{nav.simulating ? ' (simulación)' : ''}. Marca la entrega cuando se reciba.</span></div>
                        ) : (
                            <div className="drv-eta">
                                <span>Llegada aprox.</span>
                                <b>{clockIn(nav.etaSec)}</b>
                                <span>· {minutes(nav.etaSec)} min · {(nav.etaKm ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} km{nav.simulating ? ' · simulado' : ''}</span>
                            </div>
                        ))}
                        {next.address && !nextLl && <div className="rp-nogeo" style={{ marginTop: 8 }}>No se ubicó esta dirección en el mapa: no hay llegada estimada ni simulación.</div>}

                        {nav.canSimulate && (nav.simulating ? (
                            <>
                                <div className="drv-sim__bar"><i style={{ width: `${nav.progress * 100}%` }} /></div>
                                <div className="drv-sim">
                                    <button type="button" className="drv-sim__btn" onClick={nav.stopSim}>Detener simulación</button>
                                    {nav.progress < 1 && <button type="button" className="drv-sim__btn is-skip" onClick={nav.skipSim}>Saltar · llegar ya</button>}
                                </div>
                            </>
                        ) : (
                            <div className="drv-sim">
                                <button type="button" className="drv-sim__btn" disabled={nav.simLoading} onClick={() => void nav.startSim()}>{nav.simLoading ? 'Calculando ruta…' : '▶ Simular ruta'}</button>
                            </div>
                        ))}

                        <div className="drv-actions">
                            <a className="drv-btn drv-btn--go" href={navigateUrl(next.address, nextLl)} target="_blank" rel="noopener noreferrer">{NAV} Navegar</a>
                            {canEdit
                                ? <button type="button" className="drv-btn drv-btn--mark" onClick={() => onMark(next)}>{CHECK} Marcar entrega</button>
                                : <span className="drv-btn drv-btn--mark" style={{ opacity: 0.5 }}>Sin permiso</span>}
                        </div>
                        {client && (client.contacto || client.tel) && (
                            <div className="drv-contact">
                                <span>Contacto: <b style={{ color: 'var(--text)' }}>{String(client.contacto || client.razon)}</b></span>
                                {client.tel && <a href={`tel:${String(client.tel).replace(/\s/g, '')}`}>{String(client.tel)}</a>}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="drv-done"><b>Ruta terminada</b><span>{ok} entregada(s){done.length - ok ? ` · ${done.length - ok} no entregada(s)` : ''}</span></div>
                )}

                {later.length > 0 && <div className="drv-group">Después</div>}
                {later.map(s => (
                    <div key={s.code} className="drv-item">
                        <span className="rp-stop__n" style={numStyle}>{n(s)}</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="drv-item__client">{s.client}</div>
                            <div className="drv-item__addr">{s.address}</div>
                        </div>
                        <a className="drv-item__go" href={navigateUrl(s.address, nav.llOf(s.code))} target="_blank" rel="noopener noreferrer">Ir</a>
                    </div>
                ))}

                {done.length > 0 && <div className="drv-group">Completadas</div>}
                {done.map(s => (
                    <div key={s.code} className="drv-item" onClick={() => canEdit && onMark(s)} style={{ cursor: canEdit ? 'pointer' : undefined }}>
                        <span className={'rp-stop__n ' + (s.status === 'Entregado' ? 'is-ok' : 'is-fail')}>{s.status === 'Entregado' ? '✓' : '!'}</span>
                        <div style={{ minWidth: 0 }}>
                            <div className="drv-item__client">{s.client}</div>
                            <div className="drv-item__addr">{s.status === 'Entregado' ? `Recibió ${s.delivery?.receiver ?? ''}` : s.delivery?.reason}</div>
                        </div>
                        {canEdit && <span className="drv-item__go">Cambiar</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Aviso flotante sobre el mapa: simulación o estado del GPS. */
export function NavBanner({ nav }: { nav: Navigation }) {
    if (nav.simulating) {
        return (
            <div className="rm-float rm-card drv-banner">
                <span className="drv-banner__dot" style={{ background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-bg)' }} />
                {nav.progress >= 1 ? 'Simulación · el vehículo llegó a destino' : `Simulación · llega en ${minutes(nav.etaSec ?? 0)} min`}
            </div>
        );
    }
    const g = nav.gps;
    if (g.state === 'ok') {
        return (
            <div className="rm-float rm-card drv-banner">
                <span className="drv-banner__dot" />
                {nav.km != null ? `GPS activo · a ${nav.km.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km de la próxima parada` : 'GPS activo'}
            </div>
        );
    }
    if (g.state === 'off') {
        return (
            <div className="rm-float rm-card drv-banner is-warn">
                <span>⚠ {g.reason}{nav.approxLl ? ` · posición estimada en ${nav.approxFrom}` : ''}</span>
                <button type="button" className="drv-banner__act" onClick={nav.retryGps}>Reintentar</button>
            </div>
        );
    }
    if (g.state === 'buscando') return <div className="rm-float rm-card drv-banner">Buscando tu ubicación…</div>;
    return null;
}
