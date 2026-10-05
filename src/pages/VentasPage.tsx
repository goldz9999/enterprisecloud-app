import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Pagination } from '../components/Pagination';
import { StatusChip, toneColor, type Tone } from '../components/StatusChip';
import { Toast, useToast } from '../components/Toast';
import { audit } from '../data/domain/audit';
import { canCancel, cancelOrder, orderTotal, saleListStatus } from '../data/domain/orders';
import { can } from '../data/permissions';
import { getDB, mutate, useDB } from '../data/store';
import { addDays, daysBetween, fmtDate, fmtDayMonth } from '../lib/dates';
import { downloadCsv, openPrintable } from '../lib/csv';
import { formatMoney } from '../lib/format';
import './VentasPage.css';

type SaleStatus = 'Pagado' | 'Pendiente' | 'Vencido' | 'Anulado';
const TONE: Record<SaleStatus, Tone> = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red', Anulado: 'muted' };
const RANGES = { Hoy: 0, '7 días': 7, '30 días': 30, Todo: 99999 } as const;
type Range = keyof typeof RANGES;
const STATUSES = ['Todos', 'Pagado', 'Pendiente', 'Vencido', 'Anulado'] as const;
type StatusFilter = (typeof STATUSES)[number];
const COLS = '28px 104px minmax(0, 1.4fr) minmax(0, 1.2fr) 92px 80px 100px 96px 84px';

function Check({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <span role="checkbox" aria-checked={on} aria-label={label} tabIndex={0} className={'check' + (on ? ' is-on' : '')} onClick={onClick} onKeyDown={e => e.key === ' ' && (e.preventDefault(), onClick())}>
      {on ? '✓' : ''}
    </span>
  );
}

export function VentasPage() {
  const d = useDB();
  const navigate = useNavigate();
  const toast = useToast();
  const [range, setRange] = useState<Range>('30 días');
  const [status, setStatus] = useState<StatusFilter>('Todos');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const canCreate = can(d, 'Órdenes de venta', 'Crear');
  const canEdit = can(d, 'Órdenes de venta', 'Editar');

  const sales = useMemo(() => {
    const today = new Date();
    return d.orders
      .filter(o => o.kind === 'venta')
      .map(o => {
        const created = new Date(o.createdAt);
        const total = orderTotal(o);
        const first = o.lines[0];
        return {
          id: o.code,
          order: o,
          client: o.party.name,
          ruc: o.party.ruc,
          product: first ? `${first.name} ×${first.qty.toLocaleString('en-US')}` : '—',
          more: o.lines.length > 1 ? `+${o.lines.length - 1} producto${o.lines.length > 2 ? 's' : ''}` : '1 producto',
          total,
          status: saleListStatus(d, o) as SaleStatus,
          days: daysBetween(created, today),
          date: fmtDate(created),
        };
      })
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt));
  }, [d]);

  // Any filter change resets paging and selection so no hidden row stays selected.
  const refilter = (fn: () => void) => {
    fn();
    setPage(1);
    setSel({});
  };

  const q = client.trim().toLowerCase();
  const base = sales.filter(r => r.days <= RANGES[range] && (!q || r.client.toLowerCase().includes(q) || r.ruc.includes(q) || r.id.toLowerCase().includes(q)));
  const list = base.filter(r => status === 'Todos' || r.status === status);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * size, cur * size);
  const selected = list.filter(r => sel[r.id]);
  const allOn = slice.length > 0 && slice.every(r => sel[r.id]);
  const hasFilters = range !== '30 días' || status !== 'Todos' || !!q;

  const today = new Date();
  const rangeLabel = range === 'Todo' ? 'Todo el historial' : range === 'Hoy' ? fmtDate(today) : `${fmtDayMonth(addDays(today, -RANGES[range]))} – ${fmtDate(today)}`;
  const clear = () => refilter(() => { setRange('30 días'); setStatus('Todos'); setClient(''); });

  const exportCsv = (rows = list) => {
    downloadCsv('ordenes-de-venta.csv', ['Orden', 'Fecha', 'Cliente', 'RUC', 'Productos', 'Subtotal', 'IGV', 'Total', 'Estado'], rows.map(r => {
      const sub = r.total / (1 + r.order.igvRate);
      return [r.id, r.date, r.client, r.ruc, r.order.lines.map(l => `${l.name} x${l.qty}`).join(' | '), sub.toFixed(2), (r.total - sub).toFixed(2), r.total.toFixed(2), r.status];
    }));
    mutate(dr => audit(dr, { action: 'Exportar', module: 'Ventas', ref: 'Órdenes de venta', desc: `Exportación a CSV · ${rows.length} filas` }));
  };

  const printList = (rows: typeof list) => {
    const s = getDB().settings;
    const body = rows.map(r => `<tr><td>${r.id}</td><td>${r.date}</td><td>${r.client}</td><td style="text-align:right">${formatMoney(r.total)}</td><td>${r.status}</td></tr>`).join('');
    openPrintable(`<!doctype html><html><head><meta charset="utf-8"><title>Órdenes de venta</title><style>body{font:13px system-ui;margin:40px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}</style></head><body><h2>${s.razon} · Órdenes de venta</h2><table><thead><tr><th>Orden</th><th>Fecha</th><th>Cliente</th><th style="text-align:right">Total</th><th>Estado</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  };

  const emailList = (rows: typeof list) => {
    const subject = encodeURIComponent(`Órdenes de venta (${rows.length})`);
    const text = encodeURIComponent(rows.map(r => `${r.id} · ${r.client} · ${formatMoney(r.total)} · ${r.status}`).join('\n'));
    window.location.href = `mailto:?subject=${subject}&body=${text}`;
  };

  const cancelMany = (codes: string[]) => {
    let done = 0;
    mutate(dr => {
      for (const c of codes) {
        const o = dr.orders.find(x => x.code === c);
        if (o && canCancel(o)) {
          cancelOrder(dr, c);
          done++;
        }
      }
    });
    setSel({});
    const skipped = codes.length - done;
    toast.flash(`${done} orden${done === 1 ? '' : 'es'} anulada${done === 1 ? '' : 's'}${skipped ? ` · ${skipped} no se pueden anular porque ya se despacharon` : ''}`);
  };

  return (
    <AppShell
      active="Órdenes de venta"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Ventas' }, { label: 'Órdenes de venta' }]}
      actions={
        canCreate && (
          <button type="button" className="btn btn--primary" onClick={() => navigate('/ventas/ordenes/nueva')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Nueva venta
          </button>
        )
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Órdenes de venta</h1>
          <div className="page__subtitle">Órdenes de venta, comprobantes y estado de cobro</div>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => exportCsv()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
          Exportar
        </button>
      </div>

      <section className="filters">
        <div className="filters__group">
          <span className="field__label">Rango de fechas</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="daterange mono">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              {rangeLabel}
            </div>
            <div className="seg-buttons">
              {(Object.keys(RANGES) as Range[]).map(r => (
                <button key={r} type="button" className={range === r ? 'is-on' : ''} onClick={() => refilter(() => setRange(r))}>{r}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="filters__group">
          <span className="field__label">Estado</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUSES.map(s => (
              <button key={s} type="button" className={'filter-chip filter-chip--tall filter-chip--ghost' + (status === s ? ' is-on' : '')} onClick={() => refilter(() => setStatus(s))}>
                <span className="filter-chip__dot" style={{ background: s === 'Todos' ? 'var(--faint)' : toneColor(TONE[s]) }} />
                {s}
                <span className="filter-chip__count">{s === 'Todos' ? base.length : base.filter(r => r.status === s).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filters__group" style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span className="field__label">Cliente</span>
          <label className="search search--inset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 12 0v1" /></svg>
            <input value={client} onChange={e => refilter(() => setClient(e.target.value))} placeholder="Nombre, RUC u orden" />
          </label>
        </div>
        {hasFilters && <button type="button" className="link-btn" onClick={clear}>Limpiar filtros</button>}
      </section>

      <section className="panel" style={{ overflow: 'visible' }}>
        <div className="panel__head" style={{ minHeight: 44, padding: '8px 16px', gap: 12 }}>
          {selected.length === 0 ? (
            <>
              <span className="panel__title">{list.length} órdenes</span>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>
                Total filtrado <span className="mono" style={{ color: 'var(--text)' }}>{formatMoney(list.reduce((a, r) => a + r.total, 0))}</span>
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 500 }}>{selected.length} seleccionadas</span>
              <button type="button" className="bulk-btn" onClick={() => printList(selected)}>Descargar PDF</button>
              <button type="button" className="bulk-btn" onClick={() => exportCsv(selected)}>Exportar CSV</button>
              <button type="button" className="bulk-btn" onClick={() => emailList(selected)}>Enviar por correo</button>
              {canEdit && <button type="button" className="bulk-btn" style={{ color: 'var(--red)' }} onClick={() => cancelMany(selected.map(r => r.id))}>Anular</button>}
            </>
          )}
          <span className="panel__hint" style={{ marginLeft: 'auto' }}>Montos en soles · IGV {Math.round((sales[0]?.order.igvRate ?? 0.18) * 100)}%</span>
        </div>

        <div role="table">
          <div role="row" className="vrow vrow--head" style={{ gridTemplateColumns: COLS }}>
            <Check on={allOn} label="Seleccionar página" onClick={() => setSel(s => ({ ...s, ...Object.fromEntries(slice.map(r => [r.id, !allOn])) }))} />
            <span>#Orden</span><span>Cliente</span><span>Productos</span><span className="t-right">Subtotal</span><span className="t-right">IGV</span><span className="t-right">Total</span><span>Estado</span><span className="t-right">Acciones</span>
          </div>
          {slice.map(r => {
            const sub = r.total / (1 + r.order.igvRate);
            return (
              <div key={r.id} role="row" className={'vrow' + (sel[r.id] ? ' is-selected' : '')} style={{ gridTemplateColumns: COLS }}>
                <Check on={!!sel[r.id]} label={'Seleccionar ' + r.id} onClick={() => setSel(s => ({ ...s, [r.id]: !s[r.id] }))} />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/ventas/orden/${r.id}`} className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.id}</Link>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{r.date}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{r.client}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{r.ruc.length === 8 ? 'DNI' : 'RUC'} {r.ruc}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ color: 'var(--text-2)' }}>{r.product}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.more}</div>
                </div>
                <span className="mono t-right vrow__num" style={{ color: 'var(--text-2)' }}>{formatMoney(sub)}</span>
                <span className="mono t-right vrow__num" style={{ color: 'var(--muted)' }}>{formatMoney(r.total - sub)}</span>
                <span className="mono t-right" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMoney(r.total)}</span>
                <span><StatusChip label={r.status} tone={TONE[r.status]} /></span>
                <div className="row-actions" style={{ position: 'relative' }}>
                  <button type="button" title="Ver detalle" onClick={() => navigate(`/ventas/orden/${r.id}`)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                  <button type="button" title="Documentos de la orden" onClick={() => navigate(`/documentos?q=${r.id}`)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                  </button>
                  <button type="button" title="Más acciones" aria-haspopup="menu" aria-expanded={menu === r.id} onClick={() => setMenu(m => (m === r.id ? null : r.id))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                  {menu === r.id && (
                    <div role="menu" className="row-menu" onMouseLeave={() => setMenu(null)}>
                      <button type="button" role="menuitem" onClick={() => navigate(`/ventas/orden/${r.id}`)}>Abrir orden</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); printList([r]); }}>Imprimir resumen</button>
                      {canEdit && canCancel(r.order) && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(null); cancelMany([r.id]); }}>Anular orden</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && (
          <div className="table__empty">
            {sales.length === 0 ? (
              <>Aún no hay ventas. {canCreate && <Link to="/ventas/ordenes/nueva">Registrar la primera venta</Link>}</>
            ) : (
              <>No hay ventas que coincidan con los filtros. <a onClick={clear} style={{ cursor: 'pointer' }}>Limpiar filtros</a></>
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
      <Toast message={toast.message} />
    </AppShell>
  );
}
