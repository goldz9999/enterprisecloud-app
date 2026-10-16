import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../lib/format';
import './LinesEditor.css';
import './PartyPicker.css';

export interface PartyOption {
  id: number | string;
  name: string;
  /** Tipo y número de documento ya formateado, p. ej. «RUC 20123456789». */
  doc: string;
  code: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  terms: string;
  /** Línea de crédito (solo clientes). */
  credit?: number;
}

interface Props {
  /** «Cliente» o «Proveedor». */
  noun: string;
  options: PartyOption[];
  value: number | string | '';
  onChange: (id: number | string) => void;
  /** Una sola columna de datos, para columnas angostas. */
  compact?: boolean;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/**
 * Selector con buscador para clientes o proveedores: muestra el elegido con sus datos
 * y abre una ventana para buscar por nombre, documento, código o contacto.
 */
export function PartyPicker({ noun, options, value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = options.find(o => o.id === value);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className={'pp' + (compact ? ' pp--compact' : '')}>
      <button ref={trigger} type="button" className="pp__trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${noun}: ${current?.name ?? 'sin elegir'}. Cambiar`}>
        <span className="pp__avatar" aria-hidden="true">{current ? initials(current.name) : '?'}</span>
        <span className="pp__who">
          <strong className="ellipsis">{current?.name ?? `Elegir ${noun.toLowerCase()}`}</strong>
          <small className="mono ellipsis">{current ? [current.doc, current.code].filter(Boolean).join(' · ') : `Busca por nombre o documento`}</small>
        </span>
        <span className="pp__change">{current ? 'Cambiar' : 'Buscar'}</span>
      </button>

      {/* Siempre visible (vacía si no hay elegido) para que el espacio quede reservado y no salte el layout. */}
      <dl className="pp__facts">
        <Fact label="Contacto" value={current?.contact ?? ''} />
        <Fact label="Teléfono" value={current?.phone ?? ''} mono />
        <Fact label="Correo" value={current?.email ?? ''} />
        <Fact label="Condición" value={!current ? '' : current.credit && current.credit > 0 ? `${current.terms} · línea ${formatMoney(current.credit)}` : current.terms} />
        <Fact wide label="Dirección" value={current?.address ?? ''} warn={current ? `Sin dirección registrada: complétala en Mantenimiento › ${noun}s` : undefined} />
      </dl>

      {open && <PartyDialog noun={noun} options={options} currentId={current?.id} onPick={id => { onChange(id); close(); }} onClose={close} />}
    </div>
  );
}

/** Siempre una sola línea (con puntos suspensivos y el valor completo al pasar el cursor) para que la altura no cambie. */
function Fact({ label, value, mono, wide, warn }: { label: string; value: string; mono?: boolean; wide?: boolean; warn?: string }) {
  const text = value || warn || '—';
  return (
    <div className={wide ? 'pp__wide' : undefined}>
      <dt>{label}</dt>
      <dd className={(mono ? 'mono ' : '') + (!value && warn ? 'is-warn' : '')} title={text}>{text}</dd>
    </div>
  );
}

function PartyDialog({ noun, options, currentId, onPick, onClose }: { noun: string; options: PartyOption[]; currentId?: number | string; onPick: (id: number | string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(() => Math.max(0, options.findIndex(o => o.id === currentId)));
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    return tokens.length ? options.filter(o => tokens.every(t => norm(`${o.name} ${o.doc} ${o.code} ${o.contact} ${o.phone}`).includes(t))) : options;
  }, [q, options]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = matches[active]; if (o) onPick(o.id); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  return createPortal(
    <div className="ps-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="ps" role="dialog" aria-modal="true" aria-label={`Elegir ${noun.toLowerCase()}`} onKeyDown={onKeyDown}>
        <div className="ps__head">
          <span className="ps__title">Elegir {noun.toLowerCase()}</span>
          <button type="button" className="drawer__close" aria-label="Cerrar" title="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="ps__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0); }}
            placeholder="Buscar por nombre, documento o contacto…"
            aria-label={`Buscar ${noun.toLowerCase()}`}
            autoComplete="off"
          />
        </div>
        {matches.length === 0 ? (
          <div className="ps__empty">{q ? <>Ningún {noun.toLowerCase()} coincide con «{q}».</> : `No hay ${noun.toLowerCase()}s activos.`}</div>
        ) : (
          <ul ref={listRef} className="ps__list" role="listbox">
            {matches.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === currentId}
                data-active={i === active}
                className={'ps__item pp__item' + (i === active ? ' is-active' : '') + (o.id === currentId ? ' is-current' : '')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onPick(o.id)}
              >
                <span className="pp__avatar pp__avatar--sm" aria-hidden="true">{initials(o.name)}</span>
                <span className="ps__main">
                  <span className="ps__name">{o.name}</span>
                  <span className="ps__meta mono">{[o.doc, o.code].filter(Boolean).join(' · ')}</span>
                  {o.address && <span className="ps__meta ellipsis">{o.address}</span>}
                </span>
                <span className="ps__side">
                  <span>{o.terms}</span>
                  {o.phone && <span className="ps__stock mono">{o.phone}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="ps__foot">{matches.length} {noun.toLowerCase()}{matches.length === 1 ? '' : 's'}</div>
      </div>
    </div>,
    document.body,
  );
}