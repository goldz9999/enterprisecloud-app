import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@/shared/lib/format';
import './LinesEditor.css';

export interface ProductOption {
  sku: string;
  name: string;
  unit: string;
  /** Precio o costo que se mostrará a la derecha. */
  price: number;
  /** Disponible en el almacén de la operación (solo ventas). */
  available?: number | null;
}

interface Props {
  /** Título de la ventana: «Agregar producto» o «Cambiar producto». */
  title?: string;
  options: ProductOption[];
  /** SKU seleccionado hoy (se resalta). */
  currentSku?: string;
  /** SKUs que ya están en la lista (se marcan). */
  usedSkus?: Set<string>;
  onPick: (sku: string) => void;
  onClose: () => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MAX_SHOWN = 80;

/**
 * Buscador de productos: escribes parte del nombre o del SKU y la lista se filtra.
 * Flechas para moverte, Enter para elegir, Esc o clic fuera para cerrar. Se abre como ventana centrada sobre el formulario.
 */
export function ProductSearch({ title = 'Agregar producto', options, currentSku, usedSkus, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const all = tokens.length ? options.filter(o => tokens.every(t => norm(`${o.name} ${o.sku}`).includes(t))) : options;
    return all;
  }, [q, options]);
  const shown = matches.slice(0, MAX_SHOWN);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, q]);

  const choose = (i: number) => {
    const o = shown[i];
    if (o) onPick(o.sku);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  return createPortal(
    <div className="ps-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={boxRef} className="ps" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
      <div className="ps__head">
        <span className="ps__title">{title}</span>
        <button type="button" className="drawer__close" aria-label="Cerrar" title="Cerrar" onClick={onClose}>×</button>
      </div>
      <div className="ps__search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          autoFocus
          value={q}
          onChange={e => { setQ(e.target.value); setActive(0); }}
          placeholder="Buscar por nombre o código…"
          aria-label="Buscar producto"
          role="combobox"
          aria-expanded="true"
          aria-controls="ps-list"
          autoComplete="off"
        />
      </div>
      {shown.length === 0 ? (
        <div className="ps__empty">{q ? <>Ningún producto coincide con «{q}».</> : 'No hay productos activos.'}</div>
      ) : (
        <ul id="ps-list" ref={listRef} className="ps__list" role="listbox">
          {shown.map((o, i) => {
            const short = o.available != null && o.available <= 0;
            return (
              <li
                key={o.sku}
                role="option"
                aria-selected={o.sku === currentSku}
                data-active={i === active}
                className={'ps__item' + (i === active ? ' is-active' : '') + (o.sku === currentSku ? ' is-current' : '')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span className="ps__main">
                  <span className="ps__name">{o.name}</span>
                  <span className="ps__meta mono">
                    {o.sku} · {o.unit}
                    {usedSkus?.has(o.sku) && o.sku !== currentSku && <em> · ya está en la lista</em>}
                  </span>
                </span>
                <span className="ps__side">
                  <span className="mono">{formatMoney(o.price)}</span>
                  {o.available != null && (
                    <span className={'ps__stock' + (short ? ' is-short' : '')}>{short ? 'Sin stock' : `${o.available.toLocaleString('en-US')} disp.`}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="ps__foot">
        {matches.length > MAX_SHOWN ? `Mostrando ${MAX_SHOWN} de ${matches.length}: sigue escribiendo para afinar` : `${matches.length} producto${matches.length === 1 ? '' : 's'}`}
      </div>
    </div>
    </div>,
    document.body,
  );
}
