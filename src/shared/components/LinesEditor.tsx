import { useEffect, useMemo, useState } from 'react';
import { available } from '@/data/domain/stock';
import { useDB } from '@/data/store';
import type { OrderLine } from '@/data/types';
import { formatMoney } from '@/shared/lib/format';
import { ProductSearch, type ProductOption } from './ProductSearch';

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
  /** Oculta el bloque de totales cuando la pantalla ya muestra su propio resumen. */
  showTotals?: boolean;
  /** Texto del estado vacío (sin líneas). Sin él, solo se ve el encabezado y el botón de agregar. */
  emptyHint?: string;
}

/** Editable table of product lines with live totals. */
export function LinesEditor({ lines, onChange, priceFrom, warehouse, igvRate, priceLabel = 'P. unit.', lockPrice = priceFrom === 'precio', costFor, showTotals = true, emptyHint }: LinesEditorProps) {
  const suggestedPrice = (p: Record<string, unknown>) => costFor?.(String(p.sku)) ?? (Number(p[priceFrom]) || 0);
  const d = useDB();
  const products = d.records.productos.filter(p => p.estado !== 'Inactivo');
  const set = (i: number, patch: Partial<OrderLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Buscador abierto: desde el botón de una línea (cambiar su producto) o sobre «Agregar» (index = null).
  const [picker, setPicker] = useState<{ index: number | null } | null>(null);
  const options: ProductOption[] = useMemo(
    () => products.map(p => ({ sku: String(p.sku), name: String(p.nombre), unit: String(p.unidad).toLowerCase(), price: suggestedPrice(p), available: warehouse ? available(d, String(p.sku), warehouse) : null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.records.productos, d.records.stock, warehouse, costFor],
  );
  const pick = (index: number | null, sku: string) => {
    const p = products.find(x => String(x.sku) === sku);
    setPicker(null);
    if (!p) return;
    const base = { sku, name: String(p.nombre), unit: String(p.unidad).toLowerCase(), price: suggestedPrice(p) };
    if (index == null) onChange([...lines, { ...base, qty: 1 }]);
    else set(index, base);
  };
  const openPicker = (index: number | null) => setPicker({ index });
  const search = picker && (
    <ProductSearch
      title={picker.index != null ? 'Cambiar producto' : 'Agregar producto'}
      options={options}
      currentSku={picker.index != null ? lines[picker.index]?.sku : undefined}
      usedSkus={new Set(lines.map(l => l.sku))}
      onPick={sku => pick(picker.index, sku)}
      onClose={() => setPicker(null)}
    />
  );
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

  if (!lines.length && emptyHint)
    return (
      <div className="lines-editor lines-editor--empty">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" /></svg>
        <p className="le-empty__text">{emptyHint}</p>
        <button type="button" className="btn btn--sm" onClick={() => openPicker(null)}>+ Agregar producto</button>
        {search}
      </div>
    );

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
              <button type="button" className="field__control le-pick" onClick={() => openPicker(i)} aria-haspopup="listbox" aria-label={`Producto ${i + 1}: ${l.name}. Cambiar`} title="Buscar otro producto">
                <span className="ellipsis">{l.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
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
        <button type="button" className="btn btn--sm" onClick={() => openPicker(null)}>+ Agregar producto</button>
        {showTotals && (
          <div className="le-totals">
            <span>Subtotal</span><span className="mono">{formatMoney(sub)}</span>
            <span>IGV ({Math.round(igvRate * 100)}%)</span><span className="mono">{formatMoney(sub * igvRate)}</span>
            <strong>Total</strong><strong className="mono">{formatMoney(sub * (1 + igvRate))}</strong>
          </div>
        )}
      </div>
      {search}
    </div>
  );
}