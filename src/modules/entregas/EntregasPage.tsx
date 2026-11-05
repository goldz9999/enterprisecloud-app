import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { can } from '@/data/permissions';
import { useDB } from '@/data/store';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { addDays, fmtDayTime, isoDate, parseDate } from '@/shared/lib/dates';
import { useDeliveries } from '../gestionApi';
import { ModulePage, shortDay } from '../ui';
import { deliveryDate, dispatchedOn, routeSheet, type Stop } from './entregasLogic';
import { MarkDeliveryModal } from './MarkDeliveryModal';
import { RouteMap } from './RouteMap';
import { useMapRoutes } from './useMapRoutes';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const VIEW_KEY = 'entregas:vista';

const TRUCK = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7M5.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3M17.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3" /></svg>;
const STORE = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6" /></svg>;
const PHONE = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></svg>;

const tone = (s: Stop['status']) => (s === 'Entregado' ? 'green' : s === 'No entregado' ? 'red' : 'amber');

function readView(): 'mapa' | 'lista' {
    try { return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'mapa'; } catch { return 'mapa'; }
}

export function EntregasPage() {
    const d = useDB();
    const toast = useToast();
    const [day, setDay] = useState(() => isoDate(new Date()));
    // Las confirmaciones viven en el servidor: se piden solo las de las ventas despachadas del día que se muestra.
    const saved = useDeliveries(dispatchedOn(d.orders, day).map(o => o.code));
    const [marking, setMarking] = useState<Stop | null>(null);
    const [view, setViewState] = useState(readView);
    const [focus, setFocus] = useState<string | null>(null);
    const [sel, setSel] = useState<string | null>(null);
    const canEdit = can(d, 'Órdenes de venta', 'Editar');

    const sheet = routeSheet(d.orders, day, saved.data);
    const { mapRoutes, pending, missing } = useMapRoutes(sheet.routes, d.records.almacenes);
    const date = parseDate(day) ?? new Date();
    const goTo = (iso: string) => { setDay(iso); setFocus(null); setSel(null); };
    const shift = (n: number) => goTo(isoDate(addDays(date, n)));
    const setView = (v: 'mapa' | 'lista') => {
        setViewState(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento */ }
    };
    // Próximos días con entregas, para saltar rápido.
    const upcoming = [...new Set(d.orders.filter(o => o.kind === 'venta' && !o.cancelled && o.done >= 3).map(deliveryDate).filter(x => x && x >= isoDate(new Date())))].sort().slice(0, 6);
    const driverPhone = (name: string) => String(d.records.conductores.find(c => c.nombre === name)?.tel ?? '');
    const vehicleInfo = (plate: string) => {
        const v = d.records.vehiculos.find(x => x.placa === plate);
        return v ? [v.tipo, v.marca, v.capacidad].filter(Boolean).join(' · ') : '';
    };
    const colorOf = (plate: string) => mapRoutes.find(r => r.vehicle === plate)?.color ?? 'var(--muted)';
    const notFound = new Set(missing.map(s => s.code));
    const driverUrl = (plate: string) => `/entregas/ruta/${encodeURIComponent(plate)}?day=${day}`;

    const pick = (code: string, vehicle: string) => {
        setFocus(vehicle);
        setSel(code);
    };

    const stopRow = (s: Stop, i: number) => (
        <div key={s.code} className={'mod-stop' + (s.status === 'Entregado' ? ' is-ok' : s.status === 'No entregado' ? ' is-fail' : '')}>
            <span className="mod-stop__n">{s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '!' : i + 1}</span>
            <div style={{ minWidth: 0 }}>
                <span className="mod-main">{s.client}</span>
                <span className="mod-sub">{s.address || 'Sin dirección'}</span>
                <span className="mod-sub mono">{s.code}{s.guide && ` · Guía ${s.guide}`}</span>
                <span className="mod-sub" title={s.items}>{s.items}</span>
                {s.delivery && <span className="mod-sub">{s.delivery.status === 'Entregado' ? `Recibió ${s.delivery.receiver}` : s.delivery.reason} · {fmtDayTime(new Date(s.delivery.at))}{s.delivery.note && ` · ${s.delivery.note}`}</span>}
            </div>
            <div className="mod-stop__side">
                <StatusChip label={s.status} tone={tone(s.status)} />
                {canEdit && <button type="button" className="link-btn mod-noprint" onClick={() => setMarking(s)}>{s.status === 'Pendiente' ? 'Marcar entrega' : 'Cambiar'}</button>}
            </div>
        </div>
    );

    const sideStop = (s: Stop, i: number, vehicle: string | null, color: string) => (
        <div key={s.code} className={'rp-stop' + (sel === s.code ? ' is-sel' : '')} onClick={() => vehicle && pick(s.code, vehicle)}>
            <span className={'rp-stop__n' + (s.status === 'Entregado' ? ' is-ok' : s.status === 'No entregado' ? ' is-fail' : '')} style={{ '--c': color } as CSSProperties}>
                {s.status === 'Entregado' ? '✓' : s.status === 'No entregado' ? '!' : i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
                <div className="rp-stop__client">{s.client}</div>
                <div className="rp-stop__addr" title={s.address}>{s.address || 'Sin dirección'}</div>
                {vehicle && notFound.has(s.code) && <div className="rp-nogeo">No se ubicó en el mapa</div>}
            </div>
            <div className="rp-stop__side">
                <StatusChip label={s.status} tone={tone(s.status)} />
                {canEdit && <button type="button" className="link-btn" style={{ fontSize: 11.5 }} onClick={e => { e.stopPropagation(); setMarking(s); }}>{s.status === 'Pendiente' ? 'Marcar' : 'Cambiar'}</button>}
            </div>
        </div>
    );

    const located = mapRoutes.reduce((n, r) => n + r.stops.filter(s => s.ll).length, 0);

    return (
        <ModulePage
            label="Hoja de ruta"
            subtitle="Ventas despachadas (con guía) agrupadas por vehículo según su fecha de entrega. Marca cada entrega al volver de la ruta."
            loading={!saved.ready}
            error={saved.error}
            onRetry={() => void saved.reload()}
            actions={<>
                <button type="button" className="btn btn--sm" onClick={() => shift(-1)} aria-label="Día anterior">‹</button>
                <input id="entregas-day" type="date" className="field__control mod-select" style={{ minWidth: 150 }} value={day} onChange={e => e.target.value && goTo(e.target.value)} aria-label="Día de entrega" />
                <button type="button" className="btn btn--sm" onClick={() => shift(1)} aria-label="Día siguiente">›</button>
                <button type="button" className="btn btn--sm" onClick={() => goTo(isoDate(new Date()))}>Hoy</button>
                <div role="group" aria-label="Vista" style={{ display: 'inline-flex', gap: 4 }}>
                    <button type="button" className={'btn btn--sm' + (view === 'mapa' ? ' btn--primary' : '')} onClick={() => setView('mapa')}>Mapa</button>
                    <button type="button" className={'btn btn--sm' + (view === 'lista' ? ' btn--primary' : '')} onClick={() => setView('lista')}>Lista</button>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => window.print()} disabled={!sheet.total}>Imprimir</button>
            </>}
        >
            <KpiRow>
                <KpiCard label={`Entregas del ${DIAS[date.getDay()]} ${shortDay(day)}`} value={String(sheet.total)} note={`${sheet.routes.length} vehículo(s) · ${sheet.pickups.length} recojo(s)`} />
                <KpiCard label="Entregadas" value={String(sheet.delivered)} note={sheet.total ? `${Math.round((sheet.delivered / sheet.total) * 100)} % del día` : '—'} tone={sheet.delivered ? 'green' : undefined} />
                <KpiCard label="Pendientes" value={String(sheet.total - sheet.delivered - sheet.failed)} note="por confirmar" tone={sheet.total - sheet.delivered - sheet.failed ? 'amber' : undefined} />
                <KpiCard label="No entregadas" value={String(sheet.failed)} note="reprogramar con el cliente" tone={sheet.failed ? 'red' : undefined} />
            </KpiRow>

            {upcoming.length > 0 && (
                <div className="mod-toolbar mod-noprint">
                    <span className="muted" style={{ fontSize: 12.5 }}>Próximos días con entregas:</span>
                    {upcoming.map(u => <button key={u} type="button" className={'filter-chip' + (u === day ? ' is-on' : '')} onClick={() => goTo(u)}>{shortDay(u)}</button>)}
                </div>
            )}

            {sheet.total === 0 ? (
                <section className="table"><div className="table__empty mod-empty">No hay entregas despachadas para el {shortDay(day)}. Las ventas aparecen aquí cuando tienen guía de remisión y su fecha de entrega es este día.</div></section>
            ) : (
                <>
                    {view === 'mapa' && (
                        <section className="rp mod-noprint">
                            <div className="rp__map">
                                <RouteMap
                                    routes={mapRoutes}
                                    focus={focus}
                                    highlight={sel}
                                    onStopClick={pick}
                                    onRouteClick={v => { setFocus(v); setSel(null); }}
                                >
                                    {mapRoutes.length > 0 && (
                                        <div className="rm-float rp__chips">
                                            <button type="button" className={'rm-chip' + (!focus ? ' is-on' : '')} style={{ fontFamily: 'inherit' }} onClick={() => { setFocus(null); setSel(null); }}>Todos</button>
                                            {mapRoutes.map(r => (
                                                <button key={r.vehicle} type="button" className={'rm-chip' + (focus === r.vehicle ? ' is-on' : '')} onClick={() => { setFocus(focus === r.vehicle ? null : r.vehicle); setSel(null); }}>
                                                    <span className="rm-dot" style={{ background: r.color }} />{r.vehicle}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {(pending > 0 || missing.length > 0) && (
                                        <div className="rm-float rm-card rp__status">
                                            {pending > 0 ? `Ubicando direcciones en el mapa… (${located} listas)` : `${missing.length} dirección(es) no se encontraron en el mapa`}
                                        </div>
                                    )}
                                    <div className="rm-float rm-card rp__legend">
                                        <span><i style={{ background: '#0f172a', border: '1.5px solid var(--text)', borderRadius: 3 }} />Almacén</span>
                                        <span><i style={{ border: '2.5px solid var(--muted)' }} />Pendiente</span>
                                        <span><i style={{ background: '#16a34a' }} />Entregado</span>
                                        <span><i style={{ background: '#dc2626' }} />No entregado</span>
                                    </div>
                                </RouteMap>
                            </div>
                            <aside className="rp__side">
                                <div className="rp__side-head">Rutas del día</div>
                                {sheet.routes.map(r => {
                                    const color = colorOf(r.vehicle);
                                    const done = r.stops.filter(s => s.status !== 'Pendiente').length;
                                    return (
                                        <div key={r.vehicle} className={'rp-route' + (focus && focus !== r.vehicle ? ' is-dim' : '')}>
                                            <div className="rp-route__head" role="button" tabIndex={0} onClick={() => { setFocus(focus === r.vehicle ? null : r.vehicle); setSel(null); }} onKeyDown={e => e.key === 'Enter' && setFocus(r.vehicle)}>
                                                <span className="rp-route__bar" style={{ background: color }} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="rp-route__plate">{r.vehicle}</div>
                                                    <div className="rp-route__sub">{[r.driver || 'Sin conductor', vehicleInfo(r.vehicle)].filter(Boolean).join(' · ')}</div>
                                                </div>
                                                <div className="rp-prog">
                                                    {done}/{r.stops.length}
                                                    <div className="rp-prog__bar"><i style={{ width: `${(done / r.stops.length) * 100}%`, background: color }} /></div>
                                                </div>
                                                <Link to={driverUrl(r.vehicle)} target="_blank" rel="noopener noreferrer" className="rp-phone" title="Abrir vista del repartidor" onClick={e => e.stopPropagation()}>{PHONE}</Link>
                                            </div>
                                            {r.stops.map((s, i) => sideStop(s, i, r.vehicle, color))}
                                        </div>
                                    );
                                })}
                                {sheet.pickups.length > 0 && (
                                    <div className="rp-route">
                                        <div className="rp-route__head" style={{ cursor: 'default' }}>
                                            <span className="rp-route__bar" style={{ background: 'var(--border-strong)' }} />
                                            <div><div className="rp-route__plate" style={{ fontFamily: 'inherit' }}>Recoge el cliente</div><div className="rp-route__sub">en el almacén de despacho</div></div>
                                            <div className="rp-prog">{sheet.pickups.filter(s => s.status !== 'Pendiente').length}/{sheet.pickups.length}</div>
                                        </div>
                                        {sheet.pickups.map((s, i) => sideStop(s, i, null, 'var(--muted)'))}
                                    </div>
                                )}
                            </aside>
                        </section>
                    )}

                    <div className={'mod-routes' + (view === 'mapa' ? ' rm-print-only' : '')}>
                        {sheet.routes.map(r => (
                            <section key={r.vehicle} className="mod-route">
                                <div className="mod-route__head">
                                    <span className="mod-route__ico" style={{ color: colorOf(r.vehicle) }}>{TRUCK}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="mod-route__title">{r.vehicle}</div>
                                        <div className="mod-route__sub">{[r.driver || 'Sin conductor', driverPhone(r.driver), vehicleInfo(r.vehicle)].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    <span className="mod-route__count">{r.stops.filter(s => s.status === 'Entregado').length}/{r.stops.length}</span>
                                    <Link to={driverUrl(r.vehicle)} target="_blank" rel="noopener noreferrer" className="rp-phone mod-noprint" title="Abrir vista del repartidor">{PHONE}</Link>
                                </div>
                                {r.stops.map(stopRow)}
                            </section>
                        ))}
                        {sheet.pickups.length > 0 && (
                            <section className="mod-route">
                                <div className="mod-route__head">
                                    <span className="mod-route__ico">{STORE}</span>
                                    <div><div className="mod-route__title" style={{ fontFamily: 'inherit' }}>Recoge el cliente</div><div className="mod-route__sub">en el almacén de despacho</div></div>
                                    <span className="mod-route__count">{sheet.pickups.filter(s => s.status === 'Entregado').length}/{sheet.pickups.length}</span>
                                </div>
                                {sheet.pickups.map(stopRow)}
                            </section>
                        )}
                    </div>
                </>
            )}

            {marking && (
                <MarkDeliveryModal
                    stop={marking}
                    onClose={() => setMarking(null)}
                    onSaved={async msg => { await saved.reload(); toast.flash(msg); }}
                    onError={toast.flash}
                />
            )}
            <Toast message={toast.message} />
        </ModulePage>
    );
}
