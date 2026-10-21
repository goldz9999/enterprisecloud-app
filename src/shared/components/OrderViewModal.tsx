import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusChip } from '@/shared/components/StatusChip';
import { canCancel, cancelOrder, orderStatus, orderSubtotal, orderTotal, payExpired } from '@/data/domain/orders';
import { cancelPurchaseOrderRemote } from '@/data/domain/purchaseOrders';
import { approveSaleOrder } from '@/data/domain/saleApproval';
import { cancelSaleOrderRemote } from '@/data/domain/salesOrders';
import { can } from '@/data/permissions';
import { mutate, useDB } from '@/data/store';
import type { Order } from '@/data/types';
import { displayDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';

/**
 * Vista de una orden (compra o venta) sin salir de la lista.
 * Compras: solo lectura; la recepción se gestiona en Kardex.
 * Ventas: venta directa; se aprueba (despacho + comprobante) o se anula desde aquí o desde la fila.
 */
export function OrderViewModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (msg: string) => void }) {
  const d = useDB();
  const sale = order.kind === 'venta';
  const module = sale ? 'Órdenes de venta' : 'Órdenes de compra';
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
  const cancellable = canCancel(order) && can(d, module, 'Editar');
  const expired = sale && payExpired(order);
  const approvable = sale && !order.cancelled && !expired && order.done <= 1 && can(d, module, 'Editar');
  const kardexOpen = !sale && !order.cancelled && can(d, 'Kardex', 'Ver');
  const form = order.forms[0] ?? {};
  const transport = form.tra === 'Retira el cliente' ? 'Lo lleva el cliente' : [form.tra === 'Movilidad propia' ? 'Nuestras movilidades' : form.tra, form.con, form.pla].filter(Boolean).join(' · ');

  const cancel = async () => {
    setBusy(true);
    setError('');
    const res = sale ? await cancelSaleOrderRemote(order.code) : await cancelPurchaseOrderRemote(order.code);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    mutate(draft => cancelOrder(draft, order.code));
    onDone(`${order.code} anulada`);
  };

  const approve = async () => {
    setBusy(true);
    setError('');
    const res = await approveSaleOrder(order.code);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.message);
  };

  return (
    <div className="purchase-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="purchase-modal" role="dialog" aria-modal="true" aria-label={`Orden ${order.code}`} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono">{order.code}</span>
            <StatusChip label={expired ? 'Anulada por falta de pago' : sale && !order.cancelled && order.done <= 1 ? 'Por aprobar' : statusLabel} tone={expired ? 'muted' : sale && !order.cancelled && order.done <= 1 ? 'blue' : tone} />
          </div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>

        <div className="purchase-modal__body">
          <div className="purchase-modal__main">
            <section className="rcv-card">
              <h3 className="rcv-card__title">Productos</h3>
              <div className="kardex-lines kardex-lines--view">
                <div className="kardex-lines__row kardex-lines__row--head"><span>Producto</span><span className="t-right">Cant.</span><span className="t-right">{sale ? 'P. unit.' : 'Costo'}</span><span className="t-right">Subtotal</span></div>
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
                <div><dt>{sale ? 'Cliente' : 'Proveedor'}</dt><dd>{order.party.name}</dd></div>
                <div><dt>{order.party.ruc.length === 8 ? 'DNI' : 'RUC'}</dt><dd className="mono">{order.party.ruc || '—'}</dd></div>
                {sale ? (
                  <>
                    <div><dt>Dirección</dt><dd>{order.party.address || '—'}</dd></div>
                    <div><dt>Entrega</dt><dd>{form.ent ? displayDate(form.ent) : '—'}</dd></div>
                    {form.lim && <div><dt>Pagar hasta</dt><dd>{displayDate(form.lim)}</dd></div>}
                    <div><dt>Despacho desde</dt><dd>{order.warehouse || '—'}</dd></div>
                    <div><dt>Transporte</dt><dd>{transport || '—'}</dd></div>
                  </>
                ) : (
                  <div><dt>Almacén destino</dt><dd>{order.warehouse || '—'}</dd></div>
                )}
                <div><dt>Condición de pago</dt><dd>{order.party.terms || 'Contado'}</dd></div>
                <div><dt>Emitida</dt><dd>{displayDate(order.createdAt)}</dd></div>
                <div><dt>{sale ? 'Vendedor' : 'Comprador'}</dt><dd>{order.seller || '—'}</dd></div>
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
            {approvable && (
              <button type="button" className="btn btn--primary" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => void approve()}>
                {busy ? 'Aprobando…' : 'Aprobar orden'}
              </button>
            )}
            {approvable && <p className="purchase-modal__hint">Al aprobar se despacha (guía de remisión, sale el stock) y se emite el comprobante.</p>}
            {kardexOpen && (
              <Link className="btn btn--primary" style={{ justifyContent: 'center' }} to={`/inventario/kardex?oc=${encodeURIComponent(order.code)}`}>Ir a Kardex</Link>
            )}
            {cancellable && !confirm && (
              <button type="button" className="btn btn--danger-text" disabled={busy} onClick={() => setConfirm(true)}>Anular orden</button>
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
