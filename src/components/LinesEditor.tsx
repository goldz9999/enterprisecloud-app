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
}

/** Editable table of product lines with live totals. */
export function LinesEditor({ lines, onChange, priceFrom, warehouse, igvRate, priceLabel = 'P. unit.' }: LinesEditorProps) {
  const d = useDB();
  const products = d.records.productos.filter(p => p.estado !== 'Inactivo');
  const set = (i: number, patch: Partial<OrderLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, sku: string) => {
    const p = products.find(x => x.sku === sku);
    if (p) set(i, { sku, name: String(p.nombre), unit: String(p.unidad).toLowerCase(), price: Number(p[priceFrom]) || 0 });
  };
  const add = () => {
    const used = new Set(lines.map(l => l.sku));
    const p = products.find(x => !used.has(String(x.sku))) ?? products[0];
    if (!p) return;
    onChange([...lines, { sku: String(p.sku), name: String(p.nombre), unit: String(p.unidad).toLowerCase(), qty: 1, price: Number(p[priceFrom]) || 0 }]);
  };
  const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);

  if (!products.length)
    return <div className="note">No hay productos activos. Créalos en Mantenimiento › Productos para poder agregarlos aquí.</div>;

  return (
    <div className="lines-editor">
      <div className="le-row le-row--head">
        <span>Producto</span><span className="t-right">Cant.</span><span className="t-right">{priceLabel}</span><span className="t-right">Subtotal</span><span />
      </div>
      {lines.map((l, i) => {
        const avail = warehouse ? available(d, l.sku, warehouse) : null;
        return (
          <div key={i} className="le-row">
            <div style={{ minWidth: 0 }}>
              <select className="field__control" value={l.sku} onChange={e => pick(i, e.target.value)} aria-label={`Producto ${i + 1}`}>
                {!products.some(p => p.sku === l.sku) && <option value={l.sku}>{l.name}</option>}
                {products.map(p => <option key={String(p.sku)} value={String(p.sku)}>{String(p.nombre)}</option>)}
              </select>
              {avail != null && (
                <div className={'le-avail' + (avail < l.qty ? ' is-short' : '')}>
                  Disponible en {warehouse}: {avail.toLocaleString('en-US')} {l.unit}
                </div>
              )}
            </div>
            <input className="field__control t-right" type="number" min="0" step="any" value={l.qty} onChange={e => set(i, { qty: Math.max(0, Number(e.target.value)) })} aria-label={`Cantidad ${i + 1}`} />
            <input className="field__control t-right" type="number" min="0" step="any" value={l.price} onChange={e => set(i, { price: Math.max(0, Number(e.target.value)) })} aria-label={`Precio ${i + 1}`} />
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