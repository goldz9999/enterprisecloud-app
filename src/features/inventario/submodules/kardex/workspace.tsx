import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/shared/components/AppShell';
import { Pagination } from '@/shared/components/Pagination';
import { StatusChip, toneColor, type Tone } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { deleteDocument, documentError, MAX_UPLOAD_BYTES, uploadDocument } from '@/data/domain/documentsApi';
import { loadCash, loadPayables, termDays } from '@/data/domain/finance';
import { loadGoodsReceipts } from '@/data/domain/goodsReceipts';
import { loadInventory } from '@/data/domain/inventory';
import { supplierUuidByName, warehouseIdByName } from '@/data/domain/masters';
import { orderSubtotal, orderTotal, purchaseListStatus, warehouses } from '@/data/domain/orders';
import { approveReceiptRemote } from '@/data/domain/purchaseOrders';
import { can } from '@/data/permissions';
import { useDB } from '@/data/store';
import type { Order } from '@/data/types';
import { fmtDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import '@/shared/styles/order-list.css';
import '@/shared/styles/order-modal.css';

type Tab = 'Por recibir' | 'Recibidas' | 'Todas';
const TABS: Tab[] = ['Por recibir', 'Recibidas', 'Todas'];
const TONE: Record<string, Tone> = { 'Por aprobar': 'amber', 'Por recibir': 'blue', Recibida: 'green', Facturada: 'amber', Pagada: 'green', Anulada: 'muted' };
const COLS = '110px minmax(0, 1.3fr) minmax(0, 1.2fr) 120px 104px 112px 150px';

const DOC_TYPES = ['Factura', 'Boleta de venta', 'Nota de crédito', 'Nota de débito', 'Recibo por honorarios', 'Otro'];

/** Aprobación de la recepción de una orden: ingreso a inventario + comprobante del proveedor (con archivo) + egreso si es Contado. */
function ReceiptModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (msg: string) => void }) {
  const d = useDB();
  const whs = warehouses(d);
  const days = termDays(order.party.terms);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(order.lines.map(l => [l.sku, String(l.qty)])));
  const [warehouse, setWarehouse] = useState(whs.includes(order.warehouse) ? order.warehouse : whs[0]);
  const [observations, setObservations] = useState('');
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docNumber, setDocNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const received = order.lines.map(l => ({ ...l, got: Math.max(0, Number(qty[l.sku]) || 0) }));
  const hasDiff = received.some(l => l.got !== l.qty);
  const asLines = received.map(l => ({ ...l, qty: l.got }));
  const subtotal = orderSubtotal({ lines: asLines });
  const total = orderTotal({ lines: asLines, igvRate: order.igvRate });

  const submit = async () => {
    for (const l of received) {
      if (l.got > l.qty) return setError(`La cantidad recibida de ${l.name} no puede superar lo pedido (${l.qty}).`);
    }
    if (!received.some(l => l.got > 0)) return setError('Indica al menos una cantidad recibida mayor a 0.');
    if (!docNumber.trim()) return setError(`Ingresa el número de la ${docType.toLowerCase()}.`);
    if (file && file.size > MAX_UPLOAD_BYTES) return setError('El archivo supera los 20 MB.');
    if (!warehouseIdByName(warehouse)) return setError('No se pudo identificar el almacén en el servidor.');

    setSaving(true);
    setError('');
    let docId = '';
    try {
      // 1) Si hay archivo, se sube primero (queda vinculado al proveedor); el servidor lo liga a la orden al aprobar.
      if (file) {
        const supplierId = supplierUuidByName(order.party.name);
        docId = (await uploadDocument(file, 'Facturas', supplierId ? `s:${supplierId}` : '')).id;
      }
      // 2) Recepción + comprobante + egreso: una sola operación en el servidor.
      const res = await approveReceiptRemote(order.code, {
        lines: received.map(l => ({ sku: l.sku, quantity: l.got })),
        warehouse,
        observations: observations.trim(),
        invoiceType: docType,
        invoiceNumber: docNumber.trim(),
        documentId: docId,
      });
      if (!res.ok) {
        if (docId) await deleteDocument(docId).catch(() => undefined); // no dejar el archivo huérfano si la recepción no se aprobó
        return setError(res.error);
      }
      await Promise.all([loadInventory(), loadPayables(), loadCash(), loadGoodsReceipts()]);
      onDone(
        `${order.code}: recepción aprobada y ${docType.toLowerCase()} ${docNumber.trim()} registrada` +
          (res.order.done >= 5 ? ` · egreso de ${formatMoney(total)} registrado en caja` : ' · queda como cuenta por pagar'),
      );
    } catch (e) {
      if (docId) await deleteDocument(docId).catch(() => undefined);
      setError(documentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="purchase-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="purchase-modal" role="dialog" aria-modal="true" aria-label={`Aprobar recepción ${order.code}`} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title">Aprobar recepción · <span className="mono">{order.code}</span></div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" disabled={saving} onClick={onClose}>×</button>
        </div>

        <div className="purchase-modal__body">
          <div className="purchase-modal__main">
            <section className="rcv-card">
              <h3 className="rcv-card__title">Mercadería recibida</h3>
              <div className="kardex-lines">
                <div className="kardex-lines__row kardex-lines__row--head"><span>Producto</span><span className="t-right">Pedido</span><span className="t-right">Recibido</span><span className="t-right">Pendiente</span></div>
                {received.map(l => (
                  <div key={l.sku} className="kardex-lines__row">
                    <span style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: 'block' }}>{l.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{l.sku} · {l.unit}</span>
                    </span>
                    <span className="mono t-right">{l.qty.toLocaleString('en-US')}</span>
                    <input className="field__control mono" type="number" min={0} max={l.qty} step="any" value={qty[l.sku]} onChange={e => setQty(q => ({ ...q, [l.sku]: e.target.value }))} aria-label={`Cantidad recibida de ${l.name}`} />
                    <span className="mono t-right" style={{ color: l.qty - l.got > 0 ? 'var(--amber)' : 'var(--faint)' }}>{(l.qty - l.got).toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
              {hasDiff && <div className="purchase-modal__hint">Hay diferencias: la recepción quedará «con observaciones». Lo pendiente no se vuelve a recibir en esta orden.</div>}
              <div className="purchase-modal__fields">
                <label className="field">
                  <span className="field__label">Almacén de ingreso</span>
                  <select className="field__control" value={warehouse} onChange={e => setWarehouse(e.target.value)}>{whs.map(w => <option key={w}>{w}</option>)}</select>
                </label>
                <label className="field">
                  <span className="field__label">Observación</span>
                  <input className="field__control" value={observations} onChange={e => setObservations(e.target.value)} placeholder="Opcional" />
                </label>
              </div>
            </section>

            <section className="rcv-card">
              <h3 className="rcv-card__title">Comprobante del proveedor</h3>
              <div className="purchase-modal__fields">
                <label className="field">
                  <span className="field__label">Tipo de comprobante</span>
                  <select className="field__control" value={docType} onChange={e => setDocType(e.target.value)}>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                </label>
                <label className="field">
                  <span className="field__label">Número *</span>
                  <input className="field__control mono" value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Ej. F002-08812" />
                </label>
              </div>
              <label className={'rcv-file' + (file ? ' has-file' : '')}>
                <input type="file" accept=".pdf,.xml,.png,.jpg,.jpeg,.webp" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
                <span className="rcv-file__text">
                  <strong className="ellipsis">{file ? file.name : 'Adjuntar archivo del comprobante (opcional)'}</strong>
                  <small>{file ? `${(file.size / 1024).toFixed(0)} KB · clic para cambiar` : 'PDF, XML o imagen · máx. 20 MB'}</small>
                </span>
              </label>
            </section>

            {error && <div className="drawer-error" role="alert">{error}</div>}
          </div>

          <aside className="purchase-modal__aside">
            <div className="purchase-modal__label">Proveedor</div>
            <div className="purchase-modal__supplier">{order.party.name}</div>
            <dl className="purchase-modal__totals">
              <div><dt>Subtotal recibido</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
              <div><dt>IGV {Math.round(order.igvRate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
              <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
            </dl>
            <div className="purchase-modal__hint">
              {days > 0
                ? `Condición ${order.party.terms}: se registra el comprobante y queda una cuenta por pagar a ${days} días.`
                : 'Contado: al aprobar se descuenta el total de caja.'}{' '}
              Todo se guarda junto; si algo falla no se registra nada.
            </div>
            <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Aprobando…' : 'Aprobar recepción'}</button>
          </aside>
        </div>

        <div className="purchase-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/** Kardex: operación de recepción de mercadería de las órdenes de compra (los movimientos están en «Movimientos Kardex»). */
export function KardexPage() {
  const d = useDB();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('Por recibir');
  const [search, setSearch] = useState(params.get('oc') ?? '');
  const [page, setPage] = useState(1);
  // ?oc=OC-… (enlace desde la orden) abre directamente la aprobación de esa recepción.
  const [open, setOpen] = useState<string | null>(() => params.get('oc'));
  const canApprove = can(d, 'Kardex', 'Aprobar');

  const rows = useMemo(
    () =>
      d.orders
        .filter(o => o.kind === 'compra' && !o.cancelled)
        .map(o => ({
          o,
          status: purchaseListStatus(o),
          total: orderTotal(o),
          products: o.lines.map(l => `${l.name} ×${l.qty.toLocaleString('en-US')}`).join(', '),
        }))
        .sort((a, b) => b.o.createdAt.localeCompare(a.o.createdAt)),
    [d.orders],
  );

  const q = search.trim().toLowerCase();
  const matches = rows.filter(r => !q || r.o.code.toLowerCase().includes(q) || r.o.party.name.toLowerCase().includes(q) || r.o.party.ruc.includes(q));
  const list = matches.filter(r => (tab === 'Por recibir' ? r.o.done <= 2 : tab === 'Recibidas' ? r.o.done >= 3 : true));
  const pending = rows.filter(r => r.o.done <= 2).length;
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * pageSize, cur * pageSize);
  const target = canApprove ? rows.find(r => r.o.code === open && r.o.done <= 2)?.o : undefined;

  const closeModal = () => {
    setOpen(null);
    if (params.has('oc')) setParams({}, { replace: true });
  };

  return (
    <AppShell active="Kardex" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Kardex' }]}>
      <div className="page-head">
        <div>
          <h1 className="page__title">Kardex</h1>
          <div className="page__subtitle">Recepción de mercadería de las órdenes de compra: revisa lo recibido, adjunta la factura y aprueba el ingreso a inventario. Los movimientos están en <Link to="/inventario/movimientos">Movimientos Kardex</Link>.</div>
        </div>
      </div>

      <section className="filters">
        <div className="filters__group">
          <span className="field__label">Vista</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map(t => (
              <button key={t} type="button" className={'filter-chip filter-chip--tall filter-chip--ghost' + (tab === t ? ' is-on' : '')} onClick={() => { setTab(t); setPage(1); }}>
                <span className="filter-chip__dot" style={{ background: t === 'Por recibir' ? toneColor('blue') : t === 'Recibidas' ? toneColor('green') : 'var(--faint)' }} />
                {t}
                <span className="filter-chip__count">{t === 'Por recibir' ? pending : t === 'Recibidas' ? rows.filter(r => r.o.done >= 3).length : rows.length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filters__group" style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span className="field__label">Orden o proveedor</span>
          <label className="search search--inset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="OC-2026-…, nombre o RUC" />
          </label>
        </div>
      </section>

      <section className="panel" style={{ overflow: 'visible' }}>
        <div className="panel__head" style={{ minHeight: 44, padding: '8px 16px', gap: 12 }}>
          <span className="panel__title">{list.length} órdenes</span>
          {tab === 'Por recibir' && <span style={{ color: 'var(--muted)' }}>· pendientes de recepción</span>}
        </div>
        <div role="table">
          <div role="row" className="vrow vrow--head" style={{ gridTemplateColumns: COLS }}>
            <span>#Orden</span><span>Proveedor</span><span>Productos</span><span>Almacén</span><span className="t-right">Total</span><span>Estado</span><span className="t-right">Acciones</span>
          </div>
          {slice.map(r => (
            <div key={r.o.code} role="row" className="vrow" style={{ gridTemplateColumns: COLS }}>
              <div style={{ minWidth: 0 }}>
                <Link to={`/compras/ordenes?ver=${r.o.code}`} className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.o.code}</Link>
                <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{fmtDate(new Date(r.o.createdAt))}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 500 }}>{r.o.party.name}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>RUC {r.o.party.ruc}</div>
              </div>
              <div className="ellipsis" style={{ color: 'var(--text-2)' }} title={r.products}>{r.products}</div>
              <span className="ellipsis" style={{ color: 'var(--muted)' }}>{r.o.warehouse}</span>
              <span className="mono t-right" style={{ fontWeight: 500 }}>{formatMoney(r.total)}</span>
              <span><StatusChip label={r.status} tone={TONE[r.status] ?? 'muted'} /></span>
              <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                {r.o.done <= 2 ? (
                  canApprove ? (
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => setOpen(r.o.code)}>Aprobar recepción</button>
                  ) : (
                    <span style={{ color: 'var(--faint)', fontSize: 11 }}>Sin permiso para aprobar</span>
                  )
                ) : (
                  <Link className="btn btn--sm" to={`/compras/ordenes?ver=${r.o.code}`}>Ver orden</Link>
                )}
              </div>
            </div>
          ))}
        </div>
        {list.length === 0 && (
          <div className="table__empty">
            {tab === 'Por recibir' ? 'No hay órdenes pendientes de recepción.' : 'No hay órdenes que coincidan.'} Las órdenes de compra nuevas aparecen aquí al crearse desde <Link to="/compras/ordenes">Órdenes de compra</Link>.
          </div>
        )}
        <div className="pager">
          <span>Mostrando <span style={{ color: 'var(--text)' }}>{list.length ? (cur - 1) * pageSize + 1 : 0}–{Math.min(cur * pageSize, list.length)}</span> de {list.length}</span>
          <Pagination page={cur} pages={pages} onPage={setPage} />
        </div>
      </section>

      {target && <ReceiptModal order={target} onClose={closeModal} onDone={msg => { closeModal(); toast.flash(msg); }} />}
      <Toast message={toast.message} />
    </AppShell>
  );
}
