import { useState } from 'react';
import { can } from '@/data/permissions';
import { currentUser } from '@/data/store';
import { KpiCard, KpiRow } from '@/shared/components/KpiCard';
import { Modal } from '@/shared/components/Modal';
import { StatusChip } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { addDays, fmtDayTime, isoDate, parseDate } from '@/shared/lib/dates';
import { useModuleStore } from '../localStore';
import { useGestionDB } from '../localCopy';
import { ModulePage, shortDay } from '../ui';
import { deliveryDate, routeSheet, type Delivery, type Stop } from './entregasLogic';

const REASONS = ['Cliente ausente', 'Dirección errada', 'Cliente rechazó la mercadería', 'Falta de tiempo en la ruta', 'Otro'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const TRUCK = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7M5.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3M17.5 19a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3" /></svg>;
const STORE = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6" /></svg>;

export function EntregasPage() {
    const d = useGestionDB();
    const toast = useToast();
    const [day, setDay] = useState(() => isoDate(new Date()));
    const [store, setStore] = useModuleStore<{ byOrder: Record<string, Delivery> }>('entregas', { byOrder: {} });
    const [marking, setMarking] = useState<Stop | null>(null);
    const [form, setForm] = useState({ status: 'Entregado' as Delivery['status'], receiver: '', reason: REASONS[0], note: '' });
    const canEdit = can(d, 'Órdenes de venta', 'Editar');

    const sheet = routeSheet(d.orders, day, store.byOrder);
    const date = parseDate(day) ?? new Date();
    const shift = (n: number) => setDay(isoDate(addDays(date, n)));
    // Próximos días con entregas, para saltar rápido.
    const upcoming = [...new Set(d.orders.filter(o => o.kind === 'venta' && !o.cancelled && o.done >= 3).map(deliveryDate).filter(x => x && x >= isoDate(new Date())))].sort().slice(0, 6);
    const driverPhone = (name: string) => String(d.records.conductores.find(c => c.nombre === name)?.tel ?? '');
    const vehicleInfo = (plate: string) => {
        const v = d.records.vehiculos.find(x => x.placa === plate);
        return v ? [v.tipo, v.marca, v.capacidad].filter(Boolean).join(' · ') : '';
    };

    const openMark = (s: Stop) => {
        setForm({ status: s.delivery?.status ?? 'Entregado', receiver: s.delivery?.receiver ?? '', reason: s.delivery?.reason ?? REASONS[0], note: s.delivery?.note ?? '' });
        setMarking(s);
    };
    const saveMark = () => {
        if (!marking) return;
        if (form.status === 'Entregado' && !form.receiver.trim()) return toast.flash('Escribe quién recibió');
        const entry: Delivery = form.status === 'Entregado'
            ? { status: 'Entregado', receiver: form.receiver.trim(), note: form.note.trim() || undefined, at: new Date().toISOString(), by: currentUser(d).name }
            : { status: 'No entregado', reason: form.reason, note: form.note.trim() || undefined, at: new Date().toISOString(), by: currentUser(d).name };
        setStore({ byOrder: { ...store.byOrder, [marking.code]: entry } });
        toast.flash(`${marking.code}: ${entry.status.toLowerCase()}`);
        setMarking(null);
    };
    const undo = (code: string) => {
        const byOrder = { ...store.byOrder };
        delete byOrder[code];
        setStore({ byOrder });
        setMarking(null);
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
                <StatusChip label={s.status} tone={s.status === 'Entregado' ? 'green' : s.status === 'No entregado' ? 'red' : 'amber'} />
                {canEdit && <button type="button" className="link-btn mod-noprint" onClick={() => openMark(s)}>{s.status === 'Pendiente' ? 'Marcar entrega' : 'Cambiar'}</button>}
            </div>
        </div>
    );

    return (
        <ModulePage
            label="Hoja de ruta"
            subtitle="Ventas despachadas (con guía) agrupadas por vehículo según su fecha de entrega. Marca cada entrega al volver de la ruta."
            local
            actions={<>
                <button type="button" className="btn btn--sm" onClick={() => shift(-1)} aria-label="Día anterior">‹</button>
                <input type="date" className="field__control mod-select" style={{ minWidth: 150 }} value={day} onChange={e => e.target.value && setDay(e.target.value)} aria-label="Día de entrega" />
                <button type="button" className="btn btn--sm" onClick={() => shift(1)} aria-label="Día siguiente">›</button>
                <button type="button" className="btn btn--sm" onClick={() => setDay(isoDate(new Date()))}>Hoy</button>
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
                    {upcoming.map(u => <button key={u} type="button" className={'filter-chip' + (u === day ? ' is-on' : '')} onClick={() => setDay(u)}>{shortDay(u)}</button>)}
                </div>
            )}

            {sheet.total === 0 ? (
                <section className="table"><div className="table__empty mod-empty">No hay entregas despachadas para el {shortDay(day)}. Las ventas aparecen aquí cuando tienen guía de remisión y su fecha de entrega es este día.</div></section>
            ) : (
                <div className="mod-routes">
                    {sheet.routes.map(r => (
                        <section key={r.vehicle} className="mod-route">
                            <div className="mod-route__head">
                                <span className="mod-route__ico">{TRUCK}</span>
                                <div style={{ minWidth: 0 }}>
                                    <div className="mod-route__title">{r.vehicle}</div>
                                    <div className="mod-route__sub">{[r.driver || 'Sin conductor', driverPhone(r.driver), vehicleInfo(r.vehicle)].filter(Boolean).join(' · ')}</div>
                                </div>
                                <span className="mod-route__count">{r.stops.filter(s => s.status === 'Entregado').length}/{r.stops.length}</span>
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
            )}

            {marking && (
                <Modal
                    title={`Entrega ${marking.code}`}
                    onClose={() => setMarking(null)}
                    footer={<>
                        {marking.delivery && <button type="button" className="btn btn--danger-text" style={{ marginRight: 'auto' }} onClick={() => undo(marking.code)}>Volver a pendiente</button>}
                        <button type="button" className="btn" onClick={() => setMarking(null)}>Cancelar</button>
                        <button type="button" className="btn btn--primary" onClick={saveMark}>Guardar</button>
                    </>}
                >
                    <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>{marking.client} · {marking.address}</p>
                    <div className="seg-buttons" role="radiogroup" style={{ marginBottom: 12 }}>
                        {(['Entregado', 'No entregado'] as const).map(s => (
                            <button key={s} type="button" role="radio" aria-checked={form.status === s} className={form.status === s ? 'is-on' : undefined} onClick={() => setForm(f => ({ ...f, status: s }))}>{s}</button>
                        ))}
                    </div>
                    <div className="form-grid">
                        {form.status === 'Entregado' ? (
                            <label className="field field--wide">
                                <span className="field__label">Recibió (nombre)</span>
                                <input className="field__control" style={{ padding: '0 10px' }} value={form.receiver} onChange={e => setForm(f => ({ ...f, receiver: e.target.value }))} placeholder="Ej. Juan Pérez (almacenero)" />
                            </label>
                        ) : (
                            <label className="field field--wide">
                                <span className="field__label">Motivo</span>
                                <select className="field__control" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
                            </label>
                        )}
                        <label className="field field--wide">
                            <span className="field__label">Observación (opcional)</span>
                            <input className="field__control" style={{ padding: '0 10px' }} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                        </label>
                    </div>
                </Modal>
            )}
            <Toast message={toast.message} />
        </ModulePage>
    );
}