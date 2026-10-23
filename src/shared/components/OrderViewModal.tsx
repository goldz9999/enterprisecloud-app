import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusChip } from '@/shared/components/StatusChip';
import { canCancel, cancelOrder, orderStatus, orderSubtotal, orderTotal, payExpired } from '@/data/domain/orders';
import { cancelPurchaseOrderRemote } from '@/data/domain/purchaseOrders';
import { approveSaleOrder } from '@/data/domain/saleApproval';
import { cancelSaleOrderRemote } from '@/data/domain/salesOrders';
import { can } from '@/data/permissions';
import { mutate, useDB } from '@/data/store';
import type { Order } from '@/data/types';
import { addDays, displayDate, isoDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import './PartyPicker.css';
import './OrderCreateModal.css';

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

  // Datos para la vista de venta (mismo orden que el modal de creación).
  const supplier = sale ? undefined : d.records.proveedores.find(p => p.razon === order.party.name);
  const client = sale ? d.records.clientes.find(c => c.razon === order.party.name) : undefined;
  const phone = String(client?.tel ?? '');
  const byClient = form.tra === 'Retira el cliente';
  const vehicle = d.records.vehiculos.find(v => v.placa === form.pla);
  const driverRow = d.records.conductores.find(c => c.nombre === form.con);
  const termsDays = Number(/(\d+)/.exec(order.party.terms || '')?.[1] ?? 0);
  const docType = form.tdc || (order.party.ruc.length === 11 ? 'Factura' : 'Boleta');
  const initials = order.party.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const cancel = async () => {
    setBusy(true);
    setError('');
    const res = sale ? await cancelSaleOrderRemote(order.code) : await cancelPurchaseOrderRemote(order.code);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    mutate(draft => cancelOrder(draft, order.code));
    onDone(`${order.code} anulada`);
  };

  const navigate = useNavigate();
  // Cobrar: si la aprobación automática quedó a medias, la termina antes de ir a Cuentas por cobrar.
  const collect = async () => {
    if (order.done < 4) {
      setBusy(true);
      setError('');
      const res = await approveSaleOrder(order.code);
      setBusy(false);
      if (!res.ok) return setError(res.error);
    }
    navigate(`/finanzas/cxc?cobrar=${encodeURIComponent(order.code)}`);
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
      <div className={'purchase-modal' + ' purchase-modal--fixed om--sale om--view'} role="dialog" aria-modal="true" aria-label={`Orden ${order.code}`} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono">{order.code}</span>
            <StatusChip label={expired ? 'Anulada por falta de pago' : sale && !order.cancelled && order.done <= 1 ? 'Por aprobar' : statusLabel} tone={expired ? 'muted' : sale && !order.cancelled && order.done <= 1 ? 'blue' : tone} />
          </div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>

        {sale ? (
          <div className="purchase-modal__body">
            <div className="purchase-modal__main">
              <section className="om-section">
                <h3 className="om-section__title">Pago y entrega</h3>
                <dl className="rcv-facts">
                  <div><dt>Condición de pago</dt><dd>{order.party.terms || 'Contado'}</dd></div>
                  {form.lim
                    ? <div><dt>Pagar hasta</dt><dd>{displayDate(form.lim)}</dd></div>
                    : termsDays > 0
                      ? <div><dt>Fecha de pago ({termsDays} días)</dt><dd>{displayDate(isoDate(addDays(new Date(order.createdAt), termsDays)))}</dd></div>
                      : <div />}
                  <div><dt>Tipo de comprobante</dt><dd>{docType}</dd></div>
                  <div><dt>Almacén de despacho</dt><dd>{order.warehouse || '—'}</dd></div>
                  <div><dt>Fecha de entrega</dt><dd>{form.ent ? displayDate(form.ent) : '—'}</dd></div>
                  <div><dt>Emitida</dt><dd>{displayDate(order.createdAt)}</dd></div>
                </dl>
                {documents.length > 0 && (
                  <div className="rcv-docs">
                    {documents.map(x => <span key={x} className="rcv-docs__chip mono">{x}</span>)}
                  </div>
                )}
              </section>

              <section className="om-section">
                <h3 className="om-section__title">
                  Productos <span className="om-count">{order.lines.length}</span>
                </h3>
                <div className="kardex-lines kardex-lines--view">
                  <div className="kardex-lines__row kardex-lines__row--head"><span>Producto</span><span className="t-right">Cant.</span><span className="t-right">P. unit.</span><span className="t-right">Subtotal</span></div>
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
              {error && <div className="drawer-error" role="alert">{error}</div>}
            </div>

            <aside className="purchase-modal__aside" aria-label="Cliente, transporte e importe">
              <section className="om-aside-party">
                <h3 className="purchase-modal__label">Cliente</h3>
                <div className="pp pp--compact">
                  <div className="pp__box">
                    <div className="pp__trigger">
                      <span className="pp__avatar" aria-hidden="true">{initials}</span>
                      <span className="pp__who">
                        <strong className="ellipsis">{order.party.name}</strong>
                        <small className="mono ellipsis">{[order.party.ruc && `${order.party.ruc.length === 11 ? 'RUC' : 'DNI'} ${order.party.ruc}`, order.party.code].filter(Boolean).join(' · ')}</small>
                      </span>
                    </div>
                    <ul className="pp__card">
                      <li><span className="pp__ico" aria-hidden="true">{ICONS.user}</span><span className="pp__fact"><small>Contacto</small><span>{order.party.contact.split(' · ')[0] || '—'}</span></span></li>
                      <li><span className="pp__ico" aria-hidden="true">{ICONS.phone}</span><span className="pp__fact"><small>Teléfono</small><span className="mono">{phone || '—'}</span></span></li>
                      <li className="is-wide"><span className="pp__ico" aria-hidden="true">{ICONS.mail}</span><span className="pp__fact"><small>Correo</small><span>{order.party.email || '—'}</span></span></li>
                      <li className="is-wide"><span className="pp__ico" aria-hidden="true">{ICONS.pin}</span><span className="pp__fact"><small>Dirección de entrega</small><span>{form.dir || order.party.address || '—'}</span></span></li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="om-transport" aria-label="Transporte">
                <h3 className="purchase-modal__label">Transporte</h3>
                <div className="pp pp--compact">
                  <div className="pp__box">
                    <div className="pp__trigger">
                      <span className="pp__avatar" aria-hidden="true">{byClient ? ICONS.store : ICONS.truck}</span>
                      <span className="pp__who">
                        <strong className={'ellipsis' + (byClient ? '' : ' mono')}>{byClient ? 'La recoge el cliente' : form.pla || 'Sin vehículo'}</strong>
                        <small className="ellipsis">{byClient ? 'El cliente lleva su propia movilidad' : [vehicle?.tipo, [vehicle?.marca, vehicle?.modelo].filter(Boolean).join(' '), vehicle?.capacidad].filter(Boolean).join(' · ') || 'Nuestras movilidades'}</small>
                      </span>
                    </div>
                    {!byClient && (
                      <ul className="pp__card">
                        <li className="is-wide"><span className="pp__ico" aria-hidden="true">{ICONS.user}</span><span className="pp__fact"><small>Conductor</small><span>{form.con || '—'}</span></span></li>
                        {driverRow && (
                          <>
                            <li><span className="pp__ico" aria-hidden="true">{ICONS.id}</span><span className="pp__fact"><small>Licencia</small><span className="mono">{String(driverRow.licencia || '—')}</span></span></li>
                            <li><span className="pp__ico" aria-hidden="true">{ICONS.phone}</span><span className="pp__fact"><small>Teléfono</small><span className="mono">{String(driverRow.tel || '—')}</span></span></li>
                          </>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              <div className="purchase-modal__label">Importe</div>
              <dl className="purchase-modal__totals">
                {Number(form.dsc) > 0 ? (
                  <>
                    <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal + Number(form.dsc))}</dd></div>
                    <div><dt>Descuento</dt><dd className="mono" style={{ color: 'var(--green)' }}>−{formatMoney(Number(form.dsc))}</dd></div>
                  </>
                ) : (
                  <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
                )}
                <div><dt>IGV {Math.round(order.igvRate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
                <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
              </dl>
              {sale && !order.cancelled && order.done >= 2 && order.done <= 4 && can(d, 'Cuentas por cobrar', 'Editar') && (
                <button type="button" className="btn btn--primary" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => void collect()}>{busy ? 'Preparando…' : 'Cobrar'}</button>
              )}
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
        ) : (
          <div className="purchase-modal__body">
            <div className="purchase-modal__main">
              <section className="om-section">
                <h3 className="om-section__title">
                  Productos <span className="om-count">{order.lines.length}</span>
                  <span className="om-emitted">Emitida {displayDate(order.createdAt)}</span>
                </h3>
                <div className="kardex-lines kardex-lines--view">
                  <div className="kardex-lines__row kardex-lines__row--head"><span>Producto</span><span className="t-right">Cant.</span><span className="t-right">Costo unit.</span><span className="t-right">Subtotal</span></div>
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
                {documents.length > 0 && (
                  <div className="rcv-docs">
                    {documents.map(x => <span key={x} className="rcv-docs__chip mono">{x}</span>)}
                  </div>
                )}
              </section>
              {error && <div className="drawer-error" role="alert">{error}</div>}
            </div>

            <aside className="purchase-modal__aside" aria-label="Proveedor, almacén e importe">
              <section className="om-aside-party">
                <h3 className="purchase-modal__label">Proveedor</h3>
                <div className="pp pp--compact">
                  <div className="pp__box">
                    <div className="pp__trigger">
                      <span className="pp__avatar" aria-hidden="true">{initials}</span>
                      <span className="pp__who">
                        <strong className="ellipsis">{order.party.name}</strong>
                        <small className="mono ellipsis">{[order.party.ruc && `RUC ${order.party.ruc}`, order.party.code].filter(Boolean).join(' · ')}</small>
                      </span>
                    </div>
                    <ul className="pp__card">
                      <li><span className="pp__ico" aria-hidden="true">{ICONS.user}</span><span className="pp__fact"><small>Contacto</small><span>{order.party.contact.split(' · ')[0] || '—'}</span></span></li>
                      <li><span className="pp__ico" aria-hidden="true">{ICONS.phone}</span><span className="pp__fact"><small>Teléfono</small><span className="mono">{String(supplier?.tel || '—')}</span></span></li>
                      <li className="is-wide"><span className="pp__ico" aria-hidden="true">{ICONS.mail}</span><span className="pp__fact"><small>Correo</small><span>{order.party.email || String(supplier?.correo || '—')}</span></span></li>
                      <li className="is-wide"><span className="pp__ico" aria-hidden="true">{ICONS.pin}</span><span className="pp__fact"><small>Dirección</small><span>{order.party.address || '—'}</span></span></li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="om-transport" aria-label="Almacén destino">
                <h3 className="purchase-modal__label">Almacén destino</h3>
                <div className="field__control om-readonly">{order.warehouse || '—'}</div>
              </section>

              <div className="purchase-modal__label">Importe</div>
              <dl className="purchase-modal__totals">
                <div><dt>Condición de pago</dt><dd>{order.party.terms || 'Contado'}</dd></div>
                <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
                <div><dt>IGV {Math.round(order.igvRate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
                <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
              </dl>
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
        )}

        <div className="purchase-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

const svg = (d: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICONS = {
  user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  phone: svg(<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />),
  mail: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  pin: svg(<><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  id: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.5" /><path d="M14 10h4M14 14h4" /></>),
  truck: svg(<><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  store: svg(<><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9h18" /><path d="M10 20v-5h4v5" /></>),
};