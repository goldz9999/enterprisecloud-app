import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/shared/components/AppShell';
import { Pagination } from '@/shared/components/Pagination';
import { StatusChip, toneColor, type Tone } from '@/shared/components/StatusChip';
import { Toast, useToast } from '@/shared/components/Toast';
import { audit } from '@/data/domain/audit';
import { igvRate, orderSubtotal, orderTotal, purchaseListStatus } from '@/data/domain/orders';
import { can } from '@/data/permissions';
import { mutate, useDB } from '@/data/store';
import { downloadCsv } from '@/shared/lib/csv';
import { fmtDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { OrderCreateModal } from '@/shared/components/OrderCreateModal';
import { OrderViewModal } from '@/shared/components/OrderViewModal';
import { takePurchasePrefill } from '@/modules/reposicion/prefill';

const TONE: Record<string, Tone> = { 'Por recibir': 'blue', Recibida: 'blue', Facturada: 'amber', Pagada: 'green', Anulada: 'muted' };
const STATUSES = ['Todos', 'Por recibir', 'Recibida', 'Facturada', 'Pagada', 'Anulada'] as const;
type StatusFilter = (typeof STATUSES)[number];
const COLS = '110px minmax(0, 1.4fr) minmax(0, 1.2fr) 92px 80px 100px 112px 140px';

export function ComprasPage() {
  const d = useDB();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('Todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  // Gestión › Reposición sugerida deja una orden sugerida: se abre el modal ya lleno (una sola vez).
  const [prefill] = useState(() => takePurchasePrefill());
  const [creating, setCreating] = useState(!!prefill);
  // ?ver=OC-… abre la orden en un modal de solo lectura (también es a donde redirigen los enlaces a una orden).
  const [params, setParams] = useSearchParams();
  const viewing = params.get('ver');
  const setViewing = (code: string | null) => setParams(code ? { ver: code } : {}, { replace: true });
  const toast = useToast();
  const canCreate = can(d, 'Órdenes de compra', 'Crear');

  const orders = useMemo(
    () =>
      d.orders
        .filter(o => o.kind === 'compra')
        .map(o => ({
          id: o.code,
          order: o,
          supplier: o.party.name,
          ruc: o.party.ruc,
          warehouse: o.warehouse,
          product: o.lines[0] ? `${o.lines[0].name} ×${o.lines[0].qty.toLocaleString('en-US')}` : '—',
          more: o.lines.length > 1 ? `+${o.lines.length - 1} producto${o.lines.length > 2 ? 's' : ''}` : '1 producto',
          total: orderTotal(o),
          status: purchaseListStatus(o),
          date: fmtDate(new Date(o.createdAt)),
        }))
        .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt)),
    [d],
  );

  const q = search.trim().toLowerCase();
  const base = orders.filter(r => !q || r.supplier.toLowerCase().includes(q) || r.ruc.includes(q) || r.id.toLowerCase().includes(q));
  const list = base.filter(r => status === 'Todos' || r.status === status);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * size, cur * size);
  const hasFilters = status !== 'Todos' || !!q;
  const clear = () => { setStatus('Todos'); setSearch(''); setPage(1); };

  const exportCsv = () => {
    downloadCsv('ordenes-de-compra.csv', ['Orden', 'Fecha', 'Proveedor', 'RUC', 'Almacén', 'Productos', 'Subtotal', 'IGV', 'Total', 'Estado'], list.map(r => {
      const sub = orderSubtotal(r.order);
      return [r.id, r.date, r.supplier, r.ruc, r.warehouse, r.order.lines.map(l => `${l.name} x${l.qty}`).join(' | '), sub.toFixed(2), (r.total - sub).toFixed(2), r.total.toFixed(2), r.status];
    }));
    mutate(dr => audit(dr, { action: 'Exportar', module: 'Compras', ref: 'Órdenes de compra', desc: `Exportación a CSV · ${list.length} filas` }));
  };

  return (
    <AppShell
      active="Órdenes de compra"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Compras' }, { label: 'Órdenes de compra' }]}
      actions={
        canCreate && (
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Nueva orden de compra
          </button>
        )
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Órdenes de compra</h1>
          <div className="page__subtitle">Órdenes emitidas a proveedores. Abre una orden para avanzar su flujo.</div>
        </div>
        <button type="button" className="btn btn--sm" onClick={exportCsv}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
          Exportar
        </button>
      </div>

      <section className="filters">
        <div className="filters__group">
          <span className="field__label">Estado</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STATUSES.map(s => (
              <button key={s} type="button" className={'filter-chip filter-chip--tall filter-chip--ghost' + (status === s ? ' is-on' : '')} onClick={() => { setStatus(s); setPage(1); }}>
                <span className="filter-chip__dot" style={{ background: s === 'Todos' ? 'var(--faint)' : toneColor(TONE[s]) }} />
                {s}
                <span className="filter-chip__count">{s === 'Todos' ? base.length : base.filter(r => r.status === s).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filters__group" style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span className="field__label">Proveedor</span>
          <label className="search search--inset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 12 0v1" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nombre, RUC u orden" />
          </label>
        </div>
        {hasFilters && <button type="button" className="link-btn" onClick={clear}>Limpiar filtros</button>}
      </section>

      <section className="panel" style={{ overflow: 'visible' }}>
        <div className="panel__head" style={{ minHeight: 44, padding: '8px 16px', gap: 12 }}>
          <span className="panel__title">{list.length} órdenes</span>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <span style={{ color: 'var(--muted)' }}>
            Total filtrado <span className="mono" style={{ color: 'var(--text)' }}>{formatMoney(list.filter(r => r.status !== 'Anulada').reduce((a, r) => a + r.total, 0))}</span>
          </span>
          <span className="panel__hint" style={{ marginLeft: 'auto' }}>Montos en soles · IGV {Math.round((orders[0]?.order.igvRate ?? igvRate(d)) * 100)}%</span>
        </div>

        <div role="table">
          <div role="row" className="vrow vrow--head" style={{ gridTemplateColumns: COLS }}>
            <span>#Orden</span><span>Proveedor</span><span>Productos</span><span className="t-right">Subtotal</span><span className="t-right">IGV</span><span className="t-right">Total</span><span>Estado</span><span className="t-right">Acciones</span>
          </div>
          {slice.map(r => {
            const sub = orderSubtotal(r.order);
            return (
              <div key={r.id} role="row" className="vrow" style={{ gridTemplateColumns: COLS }}>
                <div style={{ minWidth: 0 }}>
                  <button type="button" onClick={() => setViewing(r.id)} className="mono link-btn" style={{ padding: 0, fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.id}</button>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{r.date}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{r.supplier}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>RUC {r.ruc}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ color: 'var(--text-2)' }}>{r.product}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.more}</div>
                </div>
                <span className="mono t-right vrow__num" style={{ color: 'var(--text-2)' }}>{formatMoney(sub)}</span>
                <span className="mono t-right vrow__num" style={{ color: 'var(--muted)' }}>{formatMoney(r.total - sub)}</span>
                <span className="mono t-right" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMoney(r.total)}</span>
                <span><StatusChip label={r.status} tone={TONE[r.status] ?? 'muted'} /></span>
                <div className="row-actions" style={{ gap: 6 }}>
                  <button type="button" title="Ver orden" onClick={() => setViewing(r.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                  {r.status !== 'Anulada' && can(d, 'Kardex', 'Ver') && (
                    <button type="button" className="row-actions__text" title="Recibir esta orden en Kardex" onClick={() => navigate(`/inventario/kardex?oc=${r.id}`)}>
                      Ir a Kardex
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && (
          <div className="table__empty">
            {orders.length === 0 ? (
              <>Aún no hay órdenes de compra. {canCreate && <a onClick={() => setCreating(true)} style={{ cursor: 'pointer' }}>Registrar la primera orden</a>}</>
            ) : (
              <>No hay órdenes que coincidan con los filtros. <a onClick={clear} style={{ cursor: 'pointer' }}>Limpiar filtros</a></>
            )}
          </div>
        )}

        <div className="pager">
          <span>
            Mostrando <span style={{ color: 'var(--text)' }}>{list.length ? (cur - 1) * size + 1 : 0}–{Math.min(cur * size, list.length)}</span> de {list.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Filas por página</span>
            <div className="seg-buttons seg-buttons--sm">
              {[10, 25, 50].map(n => (
                <button key={n} type="button" className={'mono' + (size === n ? ' is-on' : '')} onClick={() => { setSize(n); setPage(1); }}>{n}</button>
              ))}
            </div>
          </div>
          <Pagination page={cur} pages={pages} onPage={setPage} />
        </div>
      </section>

      {viewing && orders.find(o => o.id === viewing) && (
        <OrderViewModal
          order={orders.find(o => o.id === viewing)!.order}
          onClose={() => setViewing(null)}
          onDone={msg => { setViewing(null); toast.flash(msg); }}
        />
      )}
      {creating && (
        <OrderCreateModal
          kind="compra"
          initial={prefill ? { party: prefill.supplier, warehouse: prefill.warehouse, lines: prefill.lines } : undefined}
          onClose={() => setCreating(false)}
          onCreated={o => {
            setCreating(false);
            toast.flash(`${o.code} creada · queda pendiente de recepción en Kardex`);
          }}
        />
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}