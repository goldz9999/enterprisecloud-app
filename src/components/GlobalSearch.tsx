import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { can } from '../data/permissions';
import { useDB } from '../data/store';
import { ALL_DOMAINS, ensureLoaded } from '../data/loadAll';
import type { DB } from '../data/types';
import { NAV } from './nav';
import './GlobalSearch.css';

interface Hit {
  kind: string;
  title: string;
  sub: string;
  to: string;
  /** Permission module that must be visible. */
  module: string;
}

const enc = encodeURIComponent;

function buildIndex(d: DB): Hit[] {
  const hits: Hit[] = [];
  for (const e of NAV) {
    if (e.kind === 'section') continue;
    if (e.to) hits.push({ kind: 'Pantalla', title: e.label, sub: 'Ir a la pantalla', to: e.to, module: e.label });
    for (const c of e.children ?? []) hits.push({ kind: 'Pantalla', title: c.label, sub: e.label, to: c.to, module: c.label });
  }
  for (const o of d.orders) hits.push({ kind: o.kind === 'venta' ? 'Orden de venta' : 'Orden de compra', title: o.code, sub: o.party.name, to: `/${o.kind === 'venta' ? 'ventas' : 'compras'}/orden/${o.code}`, module: o.kind === 'venta' ? 'Órdenes de venta' : 'Órdenes de compra' });
  for (const c of d.records.clientes) hits.push({ kind: 'Cliente', title: String(c.razon), sub: `${c.cod} · ${c.ndoc}`, to: `/mantenimiento/clientes?q=${enc(String(c.ndoc))}`, module: 'Clientes' });
  for (const p of d.records.proveedores) hits.push({ kind: 'Proveedor', title: String(p.razon), sub: `${p.cod} · ${p.ruc}`, to: `/mantenimiento/proveedores?q=${enc(String(p.ruc))}`, module: 'Proveedores' });
  for (const p of d.records.productos) hits.push({ kind: 'Producto', title: String(p.nombre), sub: String(p.sku), to: `/mantenimiento/productos?q=${enc(String(p.sku))}`, module: 'Productos' });
  for (const c of d.records.comprobantes) hits.push({ kind: 'Comprobante', title: String(c.num), sub: String(c.cliente), to: `/ventas/comprobantes?q=${enc(String(c.num))}`, module: 'Comprobantes' });
  for (const c of d.cotizaciones) hits.push({ kind: 'Cotización', title: c.id, sub: c.party, to: `/ventas/cotizaciones?q=${enc(c.id)}`, module: 'Cotizaciones' });
  for (const x of d.documentos) hits.push({ kind: 'Documento', title: x.name, sub: `${x.cat} · ${x.ref}`, to: `/documentos?q=${enc(x.name)}`, module: 'Documentos' });
  for (const u of d.records.usuarios) hits.push({ kind: 'Usuario', title: String(u.nombre), sub: String(u.correo), to: `/admin/usuarios?q=${enc(String(u.correo))}`, module: 'Usuarios' });
  return hits;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Topbar search across screens and records. ⌘K / Ctrl+K focuses it. */
export function GlobalSearch({ placeholder }: { placeholder: string }) {
  const d = useDB();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const index = useMemo(() => buildIndex(d).filter(h => can(d, h.module, 'Ver')), [d]);

  const terms = norm(q.trim()).split(/\s+/).filter(Boolean);
  const results = terms.length ? index.filter(h => terms.every(t => norm(h.title + ' ' + h.sub + ' ' + h.kind).includes(t))).slice(0, 8) : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (h: Hit) => {
    setOpen(false);
    setQ('');
    input.current?.blur();
    navigate(h.to);
  };

  return (
    <div className="gsearch">
      <label className="search search--global">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={input}
          value={q}
          placeholder={placeholder}
          aria-label="Búsqueda global"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="gsearch-results"
          onChange={e => { setQ(e.target.value); setOpen(true); setActive(0); }}
          // La búsqueda cubre todos los módulos: al usarla se cargan los que aún no se habían abierto.
          onFocus={() => { setOpen(true); ensureLoaded(ALL_DOMAINS); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && results[active]) go(results[active]);
            if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          }}
        />
        <span className="kbd">⌘K</span>
      </label>
      {open && q.trim() && (
        <div className="gsearch__menu" id="gsearch-results" role="listbox">
          {results.length === 0 && <div className="gsearch__empty">Sin resultados para “{q.trim()}”.</div>}
          {results.map((h, i) => (
            <button
              key={h.kind + h.title + h.to}
              type="button"
              role="option"
              aria-selected={i === active}
              className={'gsearch__item' + (i === active ? ' is-active' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => go(h)}
            >
              <span className="gsearch__kind">{h.kind}</span>
              <span className="gsearch__title ellipsis">{h.title}</span>
              <span className="gsearch__sub ellipsis">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}