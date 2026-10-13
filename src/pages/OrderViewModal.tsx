import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusChip } from '../components/StatusChip';
import { canCancel, cancelOrder, orderStatus, orderSubtotal, orderTotal } from '../data/domain/orders';
import { cancelPurchaseOrderRemote } from '../data/domain/purchaseOrders';
import { can } from '../data/permissions';
import { mutate, useDB } from '../data/store';
import type { Order } from '../data/types';
import { displayDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import './ComprasPage.css';

/** Vista de solo lectura de una orden de compra, sin salir de la lista. La recepción se gestiona en Kardex. */
export function OrderViewModal({ order, onClose, onCancelled }: { order: Order; onClose: () => void; onCancelled: (msg: string) => void }) {
  const d = useDB();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const subtotal = orderSubtotal(order);
  const total = orderTotal(order);
  const [statusLabel, tone] = orderStatus(order);
  const documents = [order.docs[2], order.docs[3], order.docs[4]].filter(Boolean);
  const cancellable = canCancel(order) && can(d, 'Órdenes de compra', 'Editar');
  const kardexOpen = !order.cancelled && can(d, 'Kardex', 'Ver');

  const cancel = async () => {
    setBusy(true);
    setError('');
    const res = await cancelPurchaseOrderRemote(order.code);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    mutate(draft => cancelOrder(draft, order.code));
    onCancelled(`${order.code} anulada`);
  };

  return (
    <div className="purchase-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="purchase-modal" role="dialog" aria-modal="true" aria-label={`Orden ${order.code}`} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono">{order.code}</span>
            <StatusChip label={statusLabel} tone={tone} />
          </div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" onClick={onClose}>×</button>
        </div>

        <div className="purchase-modal__body">
          <div className="purchase-modal__main">
            <section className="rcv-card">
              <h3 className="rcv-card__title">Productos</h3>
              <div className="kardex-lines kardex-lines--view">
                <div className="kardex-lines__row kardex-lines__row--head"><span>Producto</span><span className="t-right">Cant.</span><span className="t-right">Costo</span><span className="t-right">Subtotal</span></div>
                {order.lines.map(l => (
                  <div key={l.sku} className="kardex-lines__row">
                    <span style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: 'block' }}>{l.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{l.sku} · {l.unit}</span>
                    </span>
                    <span className="mono t-right">{l.qty.toLocaleString('en-US')}</span>
                    <span className="mono t-right">{formatMoney(l.price)}</span>
                    <span className="mono t-right">{formatMoney(l.qty * l.price)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rcv-card">
              <h3 className="rcv-card__title">Datos de la orden</h3>
              <dl className="rcv-facts">
                <div><dt>Proveedor</dt><dd>{order.party.name}</dd></div>
                <div><dt>RUC</dt><dd className="mono">{order.party.ruc || '—'}</dd></div>
                <div><dt>Almacén destino</dt><dd>{order.warehouse || '—'}</dd></div>
                <div><dt>Condición de pago</dt><dd>{order.party.terms || 'Contado'}</dd></div>
                <div><dt>Emitida</dt><dd>{displayDate(order.createdAt)}</dd></div>
                <div><dt>Comprador</dt><dd>{order.seller || '—'}</dd></div>
              </dl>
              {documents.length > 0 && (
                <div className="rcv-docs">
                  {documents.map(x => <span key={x} className="rcv-docs__chip mono">{x}</span>)}
                </div>
              )}
            </section>
            {error && <div className="drawer-error" role="alert">{error}</div>}
          </div>

          <aside className="purchase-modal__aside">
            <div className="purchase-modal__label">Importe</div>
            <dl className="purchase-modal__totals">
              <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
              <div><dt>IGV {Math.round(order.igvRate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
              <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
            </dl>
            {kardexOpen && (
              <Link className="btn btn--primary" style={{ justifyContent: 'center' }} to={`/inventario/kardex?oc=${encodeURIComponent(order.code)}`}>Ir a Kardex</Link>
            )}
            {cancellable && !confirm && (
              <button type="button" className="btn btn--danger-text" onClick={() => setConfirm(true)}>Anular orden</button>
            )}
            {confirm && (
              <div className="purchase-modal__hint">
                ¿Anular {order.code}? Queda registrado en auditoría.
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setConfirm(false)}>No</button>
                  <button type="button" className="btn btn--sm btn--danger-text" disabled={busy} onClick={() => void cancel()}>Sí, anular</button>
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="purchase-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
