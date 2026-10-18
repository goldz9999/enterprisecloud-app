import { useEffect, useState } from 'react';
import { LinesEditor } from '@/shared/components/LinesEditor';
import { dataOf, type FlowData } from '@/data/domain/flows';
import { igvRate, orderSubtotal, orderTotal, payTermOptions, warehouses } from '@/data/domain/orders';
import { currentUser, useDB } from '@/data/store';
import type { OrderLine } from '@/data/types';
import type { FlowItem, FlowRow } from '@/shared/components/flow-list/types';
import { addDays, displayDate, isoDate, parseDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { linesError } from '@/shared/lib/lines';
import '@/shared/styles/order-modal.css';

interface Props {
  /** Cotización a editar; sin ella se crea una nueva. */
  row?: FlowRow;
  onClose: () => void;
  /** Devuelve el mensaje de error del servidor, o `undefined` si se guardó (el padre cierra el modal). */
  onSave: (data: FlowData, items: FlowItem[]) => Promise<string | undefined>;
}

const DAY = 86_400_000;

/** Días enteros desde hoy hasta la fecha (negativo = ya pasó). */
function daysUntil(iso: string): number | null {
  const t = parseDate(iso);
  if (!t) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / DAY);
}

/**
 * Ventana ancha para crear o editar una cotización sin salir de la lista (mismo patrón que las órdenes).
 * Cliente, condiciones y vigencia a la izquierda; resumen con el vencimiento y el total a la derecha.
 */
export function QuoteModal({ row, onClose, onSave }: Props) {
  const d = useDB();
  const sellers = [...new Set([currentUser(d).name, ...d.records.usuarios.filter(u => u.estado === 'Activo').map(u => String(u.nombre))])];
  const whs = warehouses(d);
  const rate = igvRate(d);
  const defWh = String(d.settings.almdef && whs.includes(String(d.settings.almdef)) ? d.settings.almdef : whs[0]);
  const validity = Number(/(\d+)/.exec(String(d.settings.vcot ?? '14'))?.[1] ?? 14);

  const [data, setData] = useState<FlowData>(() => {
    const base = row ? dataOf(d, 'cotizacion', row) : {};
    return {
      cliente: base.cliente ?? '',
      vendedor: base.vendedor ?? currentUser(d).name,
      valida: isoDate(parseDate(base.valida) ?? addDays(new Date(), validity)),
      cond: base.cond ?? 'Contado',
      alm: base.alm ?? defWh,
    };
  });
  const [lines, setLines] = useState<OrderLine[]>(() =>
    (row?.items ?? []).map(i => {
      const p = d.records.productos.find(x => x.sku === i.sku || x.nombre === i.name);
      return { sku: String(p?.sku ?? i.sku ?? i.name), name: String(p?.nombre ?? i.name), unit: i.unit, qty: i.qty, price: i.price };
    }),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setData(s => ({ ...s, [k]: v }));

  const subtotal = orderSubtotal({ lines });
  const total = orderTotal({ lines, igvRate: rate });
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const left = daysUntil(data.valida);
  const expired = left !== null && left < 0;
  const missing = !lines.length ? 'Agrega al menos un producto' : !data.valida ? 'Indica hasta cuándo es válida' : expired ? 'La fecha de validez ya pasó' : '';
  const validText = left === null ? '—' : left < 0 ? 'Vencida' : left === 0 ? 'Vence hoy' : `Vence en ${left} día${left === 1 ? '' : 's'}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async () => {
    if (missing) return setError(missing + '.');
    const le = linesError(lines);
    if (le) return setError(le);
    setSaving(true);
    setError('');
    try {
      const err = await onSave(data, lines.map(l => ({ sku: l.sku, name: l.name, qty: l.qty, unit: l.unit, price: l.price })));
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  };

  const title = row ? `Editar ${row.id}` : 'Nueva cotización';

  return (
    <div className="purchase-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="purchase-modal purchase-modal--fixed" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title">{title}</div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" aria-label="Cerrar" disabled={saving} onClick={onClose}>×</button>
        </div>

        {(
          <div className="purchase-modal__body">
            <div className="purchase-modal__main">
              <section className="om-section">
                <h3 className="om-section__title">Vigencia y condiciones</h3>
                <div className="purchase-modal__fields">
                  <label className="field">
                    <span className="field__label">Válida hasta *</span>
                    <input className="field__control" type="date" value={data.valida} onChange={e => set('valida', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">Condición de pago</span>
                    <select className="field__control" value={data.cond} onChange={e => set('cond', e.target.value)}>
                      {[...new Set([data.cond, ...payTermOptions(d)])].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Entrega desde</span>
                    <select className="field__control" value={data.alm} onChange={e => set('alm', e.target.value)}>
                      {data.alm && !whs.includes(data.alm) && <option>{data.alm}</option>}
                      {whs.map(w => <option key={w}>{w}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Vendedor</span>
                    <select className="field__control" value={data.vendedor} onChange={e => set('vendedor', e.target.value)}>
                      {data.vendedor && !sellers.includes(data.vendedor) && <option>{data.vendedor}</option>}
                      {sellers.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
                <p className="purchase-modal__hint">Al pasar esta fecha la cotización queda como «Vencida» y ya no se puede aprobar ni convertir en orden de venta.</p>
              </section>

              <section className="om-section">
                <h3 className="om-section__title">
                  Productos
                  {lines.length > 0 && <span className="om-count">{lines.length}</span>}
                </h3>
                <LinesEditor
                  lines={lines}
                  onChange={setLines}
                  priceFrom="precio"
                  warehouse={data.alm}
                  igvRate={rate}
                  priceLabel="P. unit."
                  showTotals={false}
                  emptyHint="Agrega los productos que cotizas. El precio sale del catálogo, sin IGV."
                />
              </section>

              {error && <div className="drawer-error" role="alert">{error}</div>}
            </div>

            <aside className="purchase-modal__aside" aria-label="Resumen de la cotización">
              <div className="purchase-modal__label">Resumen</div>

              <dl className="om-facts">
                <div><dt>Válida hasta</dt><dd>{data.valida ? displayDate(data.valida) : '—'}</dd></div>
                <div><dt>Vigencia</dt><dd style={expired ? { color: 'var(--red)' } : undefined}>{validText}</dd></div>
                <div><dt>Entrega desde</dt><dd>{data.alm || '—'}</dd></div>
                <div><dt>Productos</dt><dd>{lines.length ? `${lines.length} · ${units.toLocaleString('en-US')} und.` : '—'}</dd></div>
              </dl>

              <dl className="purchase-modal__totals">
                <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
                <div><dt>IGV {Math.round(rate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
                <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
              </dl>

              <div className="om-summary__cta">
                <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving || !!missing} aria-describedby="om-missing">
                  {saving ? 'Guardando…' : row ? 'Guardar cambios' : 'Crear cotización'}
                </button>
                <p id="om-missing" className="purchase-modal__hint om-missing" aria-live="polite">
                  {missing || 'Se guarda como borrador; luego la envías al cliente.'}
                </p>
              </div>
            </aside>
          </div>
        )}

        <div className="purchase-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
