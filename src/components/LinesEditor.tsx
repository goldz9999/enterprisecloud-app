import { useEffect } from 'react';
import { available } from '../data/domain/stock';
import { useDB } from '../data/store';
import type { OrderLine } from '../data/types';
import { formatMoney } from '../lib/format';
import './LinesEditor.css';

interface LinesEditorProps {
  lines: OrderLine[];
  onChange: (lines: OrderLine[]) => void;
  /** Which product price pre-fills a new line. */
  priceFrom: 'precio' | 'costo';
  /** Shows availability per line for this warehouse (sales). */
  warehouse?: string;
  igvRate: number;
  priceLabel?: string;
  /** Show the price read-only. Defaults to true for sale prices, which are maintained in Mantenimiento › Productos. */
  lockPrice?: boolean;
  /** Purchases: price the chosen supplier charges for a product (Mantenimiento › Precios de proveedor), or null if none is registered. */
  costFor?: (sku: string) => number | null;
}

/** Editable table of product lines with live totals. */
export function LinesEditor({ lines, onChange, priceFrom, warehouse, igvRate, priceLabel = 'P. unit.', lockPrice = priceFrom === 'precio', costFor }: LinesEditorProps) {
  const suggestedPrice = (p: Record<string, unknown>) => costFor?.(String(p.sku)) ?? (Number(p[priceFrom]) || 0);
  const d = useDB();
  const products = d.records.productos.filter(p => p.estado !== 'Inactivo');
  const set = (i: number, patch: Partial<OrderLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, sku: string) => {
    const p = products.find(x => x.sku === sku);
    if (p) set(i, { sku, name: String(p.nombre), unit: String(p.unidad).toLowerCase(), price: suggestedPrice(p) });
  };
  const add = () => {
    const used = new Set(lines.map(l => l.sku));
    const p = products.find(x => !used.has(String(x.sku))) ?? products[0];
    if (!p) return;
    onChange([...lines, { sku: String(p.sku), name: String(p.nombre), unit: String(p.unidad).toLowerCase(), qty: 1, price: suggestedPrice(p) }]);
  };
  // Con precio de proveedor registrado, la línea siempre lleva ese precio (también las que ya estaban cargadas).
  const synced = lines.map(l => { const c = costFor?.(l.sku); return c != null && c !== l.price ? { ...l, price: c } : l; });
  const outOfSync = synced.some((l, i) => l !== lines[i]);
  useEffect(() => {
    if (outOfSync) onChange(synced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfSync]);
  const sub = synced.reduce((a, l) => a + l.qty * l.price, 0);

  if (!products.length)
    return <div className="note">No hay productos activos. Créalos en Mantenimiento › Productos para poder agregarlos aquí.</div>;

  return (
    <div className="lines-editor">
      <div className="le-row le-row--head">
        <span>Producto</span><span className="t-right">Cant.</span><span className="t-right">{priceLabel}</span><span className="t-right">Subtotal</span><span />
      </div>
      {lines.map((l, i) => {
        const supplierPrice = costFor?.(l.sku) ?? null;
        // El precio es fijo si viene de Mantenimiento: el de venta del producto, o el que ese proveedor tiene registrado.
        const locked = lockPrice || supplierPrice != null;
        const avail = warehouse ? available(d, l.sku, warehouse) : null;
        return (
          <div key={i} className="le-row">
            <div style={{ minWidth: 0 }}>
              <select className="field__control" value={l.sku} onChange={e => pick(i, e.target.value)} aria-label={`Producto ${i + 1}`}>
                {!products.some(p => p.sku === l.sku) && <option value={l.sku}>{l.name}</option>}
                {products.map(p => <option key={String(p.sku)} value={String(p.sku)}>{String(p.nombre)}</option>)}
              </select>
              {costFor && (
                <div className="le-avail">{supplierPrice != null ? 'Precio del proveedor (se cambia en Proveedores › Precios por proveedor)' : 'El proveedor no tiene precio registrado: costo promedio, puedes ajustarlo'}</div>
              )}
              {avail != null && (
                <div className={'le-avail' + (avail < l.qty ? ' is-short' : '')}>
                  Disponible en {warehouse}: {avail.toLocaleString('en-US')} {l.unit}
                </div>
              )}
            </div>
            <input className="field__control t-right" type="number" min="0" step="any" value={l.qty} onChange={e => set(i, { qty: Math.max(0, Number(e.target.value)) })} aria-label={`Cantidad ${i + 1}`} />
            {locked ? (
              <span className="mono t-right le-price" title={supplierPrice != null ? 'Precio registrado para este proveedor en Proveedores › Precios por proveedor' : 'El precio de venta se define en Mantenimiento › Productos'} aria-label={`Precio ${i + 1}`}>{formatMoney(l.price)}</span>
            ) : (
              <input className="field__control t-right" type="number" min="0" step="any" value={l.price} onChange={e => set(i, { price: Math.max(0, Number(e.target.value)) })} aria-label={`Precio ${i + 1}`} />
            )}
            <span className="mono t-right le-sub">{formatMoney(l.qty * l.price)}</span>
            <button type="button" className="le-del" title="Quitar línea" aria-label={`Quitar línea ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</button>
          </div>
        );
      })}
      <div className="le-foot">
        <button type="button" className="btn btn--sm" onClick={add}>+ Agregar producto</button>
        <div className="le-totals">
          <span>Subtotal</span><span className="mono">{formatMoney(sub)}</span>
          <span>IGV ({Math.round(igvRate * 100)}%)</span><span className="mono">{formatMoney(sub * igvRate)}</span>
          <strong>Total</strong><strong className="mono">{formatMoney(sub * (1 + igvRate))}</strong>
        </div>
      </div>
    </div>
  );
}