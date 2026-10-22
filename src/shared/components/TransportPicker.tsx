import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PartyPicker.css';

export interface VehicleOption {
    plate: string;
    type: string;
    brand: string;
    capacity: string;
    /** Conductor habitual del vehículo (puede estar vacío). */
    driver: string;
}
export interface DriverOption {
    name: string;
    dni: string;
    license: string;
    phone: string;
}

interface Props {
    /** '' = aún no elige; 'fleet' = nuestras movilidades; 'client' = la recoge el cliente. */
    mode: '' | 'fleet' | 'client';
    plate: string;
    driver: string;
    vehicles: VehicleOption[];
    drivers: DriverOption[];
    onPickVehicle: (plate: string) => void;
    onPickClient: () => void;
    onPickDriver: (name: string) => void;
}

const CLIENT_ID = '__client__';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Selector de movilidad con el mismo comportamiento que el de clientes:
 * una tarjeta que abre un buscador con «La recoge el cliente» y los vehículos propios.
 * Al elegir un vehículo viene su conductor habitual; se puede cambiar con «Cambiar conductor».
 */
export function TransportPicker({ mode, plate, driver, vehicles, drivers, onPickVehicle, onPickClient, onPickDriver }: Props) {
    const [dialog, setDialog] = useState<'' | 'vehicle' | 'driver'>('');
    const trigger = useRef<HTMLButtonElement>(null);
    const vehicle = vehicles.find(v => v.plate === plate);
    const drv = drivers.find(d => d.name === driver);
    const close = () => { setDialog(''); trigger.current?.focus(); };

    const vehicleItems: Item[] = [
        { id: CLIENT_ID, title: 'La recoge el cliente', meta: 'El cliente lleva su propia movilidad', icon: 'store' },
        ...vehicles.map(v => ({
            id: v.plate,
            title: [v.plate, v.type].filter(Boolean).join(' · '),
            meta: [v.brand, v.capacity].filter(Boolean).join(' · '),
            side: v.driver || 'Sin conductor asignado',
            icon: 'truck' as const,
            mono: true,
        })),
    ];
    const driverItems: Item[] = drivers.map(d => ({
        id: d.name,
        title: d.name,
        meta: [d.dni && `DNI ${d.dni}`, d.license && `Lic. ${d.license}`].filter(Boolean).join(' · '),
        side: d.phone,
        icon: 'user',
    }));

    let content;
    if (mode === 'fleet' && vehicle) {
        content = (
            <div className="pp__box">
                <button ref={trigger} type="button" className="pp__trigger" onClick={() => setDialog('vehicle')} aria-haspopup="dialog" aria-label={`Movilidad: ${vehicle.plate}. Cambiar`}>
                    <span className="pp__avatar" aria-hidden="true">{ICONS.truck}</span>
                    <span className="pp__who">
                        <strong className="ellipsis mono">{vehicle.plate}</strong>
                        <small className="ellipsis">{[vehicle.type, vehicle.brand, vehicle.capacity].filter(Boolean).join(' · ') || 'Nuestras movilidades'}</small>
                    </span>
                    <span className="pp__swap">Cambiar</span>
                </button>
                <ul className="pp__card">
                    <li className="is-wide">
                        <span className="pp__ico" aria-hidden="true">{ICONS.user}</span>
                        <span className="pp__fact">
                            <small>Conductor</small>
                            <span className={drv ? undefined : 'is-warn'}>{drv?.name || 'Elige quién maneja'}</span>
                        </span>
                        <button type="button" className="tp__link" onClick={() => setDialog('driver')}>{drv ? 'Cambiar conductor' : 'Elegir'}</button>
                    </li>
                    {drv && (
                        <>
                            <li>
                                <span className="pp__ico" aria-hidden="true">{ICONS.id}</span>
                                <span className="pp__fact"><small>Licencia</small><span className="mono">{drv.license || '—'}</span></span>
                            </li>
                            <li>
                                <span className="pp__ico" aria-hidden="true">{ICONS.phone}</span>
                                <span className="pp__fact"><small>Teléfono</small><span className="mono">{drv.phone || '—'}</span></span>
                            </li>
                        </>
                    )}
                </ul>
            </div>
        );
    } else if (mode === 'client') {
        content = (
            <div className="pp__box">
                <button ref={trigger} type="button" className="pp__trigger" onClick={() => setDialog('vehicle')} aria-haspopup="dialog" aria-label="Movilidad: la recoge el cliente. Cambiar">
                    <span className="pp__avatar" aria-hidden="true">{ICONS.store}</span>
                    <span className="pp__who">
                        <strong className="ellipsis">La recoge el cliente</strong>
                        <small className="ellipsis">El cliente lleva su propia movilidad</small>
                    </span>
                    <span className="pp__swap">Cambiar</span>
                </button>
            </div>
        );
    } else {
        content = (
            <button ref={trigger} type="button" className="pp__trigger pp__trigger--empty" onClick={() => setDialog('vehicle')} aria-haspopup="dialog">
                <span className="pp__plus" aria-hidden="true">+</span>
                <strong>Elegir movilidad</strong>
                <small>Nuestro vehículo o la recoge el cliente</small>
            </button>
        );
    }

    return (
        <div className="pp pp--compact">
            {content}
            {dialog === 'vehicle' && (
                <ListDialog
                    title="Elegir movilidad"
                    placeholder="Buscar por placa, tipo o conductor…"
                    items={vehicleItems}
                    currentId={mode === 'client' ? CLIENT_ID : plate}
                    empty={vehicles.length ? undefined : 'No hay vehículos propios activos. Regístralos en Mantenimiento › Vehículos.'}
                    onPick={id => { if (id === CLIENT_ID) onPickClient(); else onPickVehicle(id); close(); }}
                    onClose={close}
                />
            )}
            {dialog === 'driver' && (
                <ListDialog
                    title="Elegir conductor"
                    placeholder="Buscar por nombre, DNI o licencia…"
                    items={driverItems}
                    currentId={driver}
                    onPick={id => { onPickDriver(id); close(); }}
                    onClose={close}
                />
            )}
        </div>
    );
}

interface Item {
    id: string;
    title: string;
    meta?: string;
    side?: string;
    icon: keyof typeof ICONS;
    mono?: boolean;
}

function ListDialog({ title, placeholder, items, currentId, empty, onPick, onClose }: {
    title: string; placeholder: string; items: Item[]; currentId?: string; empty?: string;
    onPick: (id: string) => void; onClose: () => void;
}) {
    const [q, setQ] = useState('');
    const [active, setActive] = useState(() => Math.max(0, items.findIndex(i => i.id === currentId)));
    const listRef = useRef<HTMLUListElement>(null);
    const matches = useMemo(() => {
        const tokens = norm(q).split(/\s+/).filter(Boolean);
        return tokens.length ? items.filter(i => tokens.every(t => norm(`${i.title} ${i.meta ?? ''} ${i.side ?? ''}`).includes(t))) : items;
    }, [q, items]);

    useEffect(() => {
        listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, q]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); const it = matches[active]; if (it) onPick(it.id); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };

    return createPortal(
        <div className="ps-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="ps" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
                <div className="ps__head">
                    <span className="ps__title">{title}</span>
                    <button type="button" className="drawer__close" aria-label="Cerrar" title="Cerrar" onClick={onClose}>×</button>
                </div>
                <div className="ps__search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={placeholder} aria-label={title} autoComplete="off" />
                </div>
                {matches.length === 0 ? (
                    <div className="ps__empty">Nada coincide con «{q}».</div>
                ) : (
                    <ul ref={listRef} className="ps__list" role="listbox">
                        {matches.map((it, i) => (
                            <li
                                key={it.id}
                                role="option"
                                aria-selected={it.id === currentId}
                                data-active={i === active}
                                className={'ps__item pp__item' + (i === active ? ' is-active' : '') + (it.id === currentId ? ' is-current' : '')}
                                onMouseEnter={() => setActive(i)}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => onPick(it.id)}
                            >
                                <span className="pp__avatar pp__avatar--sm" aria-hidden="true">{ICONS[it.icon]}</span>
                                <span className="ps__main">
                                    <span className={'ps__name' + (it.mono ? ' mono' : '')}>{it.title}</span>
                                    {it.meta && <span className="ps__meta">{it.meta}</span>}
                                </span>
                                {it.side && <span className="ps__side"><span>{it.side}</span></span>}
                            </li>
                        ))}
                    </ul>
                )}
                {empty && <div className="ps__empty">{empty}</div>}
            </div>
        </div>,
        document.body,
    );
}

const svg = (d: React.ReactNode) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICONS = {
    truck: svg(<><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
    store: svg(<><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9h18" /><path d="M10 20v-5h4v5" /></>),
    user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
    phone: svg(<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />),
    id: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.5" /><path d="M14 10h4M14 14h4" /></>),
};