import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Pagination } from '../components/Pagination';
import { StatusChip, toneColor, type Tone } from '../components/StatusChip';
import { formatMoney } from '../lib/format';
import './VentasPage.css';

type SaleStatus = 'Pagado' | 'Pendiente' | 'Vencido';
const TONE: Record<SaleStatus, Tone> = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red' };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TODAY = new Date(2026, 9, 2);

interface Sale {
  id: string;
  client: string;
  ruc: string;
  product: string;
  more: string;
  /** Total including IGV. */
  total: number;
  status: SaleStatus;
  /** Days before TODAY. */
  days: number;
  date: string;
}

const fmtDay = (d: Date) => String(d.getDate()).padStart(2, '0') + ' ' + MES[d.getMonth()];

/** 24 deterministic sample orders so filters and pagination can be exercised. */
function sampleSales(): Sale[] {
  const C = [['Distribuidora Andina S.A.C.', '20512345671'], ['Constructora Pacífico E.I.R.L.', '20601122334'], ['Minera Los Andes S.A.', '20100987652'], ['Farmacias Salud Total S.A.C.', '20488776651'], ['Textil Arequipa S.R.L.', '20455667788'], ['Comercial Norte Trujillo S.A.', '20399887766'], ['Agroexportadora Ica S.A.C.', '20577889900'], ['Ferretería El Constructor E.I.R.L.', '20611223344'], ['Clínica San Gabriel S.A.', '20144556677'], ['Inversiones Cusco Plaza S.A.C.', '20522334455']];
  const P = ['Cemento Portland Tipo I 42.5 kg', 'Tubo PVC 4" x 3 m clase 10', 'Guantes de nitrilo talla M x100', 'Fierro corrugado 1/2" x 9 m', 'Pintura látex blanco 4 L', 'Cable THW 12 AWG x 100 m', 'Casco de seguridad ANSI', 'Ladrillo King Kong 18 huecos'];
  const S: SaleStatus[] = ['Pagado', 'Pendiente', 'Pagado', 'Vencido', 'Pagado', 'Pendiente', 'Pagado', 'Pagado', 'Vencido', 'Pendiente'];
  const T = [12480, 8920.5, 21300, 3145.9, 6760, 7820, 15240, 2390.4, 9875, 4410, 18600, 1290.8, 5530, 11200, 3980, 26750, 7340.6, 2215, 9460, 6100, 13890, 4725.3, 8040, 3360];
  return Array.from({ length: 24 }, (_, i) => {
    const days = Math.floor(i * 1.6);
    const d = new Date(TODAY);
    d.setDate(d.getDate() - days);
    const [client, ruc] = C[(i * 7) % 10];
    const n = 1 + ((i * 3) % 4);
    return {
      id: 'OV-2026-' + (1284 - i),
      client,
      ruc,
      product: P[(i * 5) % 8] + ' ×' + (10 + ((i * 13) % 90)),
      more: n > 1 ? '+' + (n - 1) + ' producto' + (n > 2 ? 's' : '') : '1 producto',
      total: T[i],
      status: S[(i * 3) % 10],
      days,
      date: fmtDay(d) + ' ' + d.getFullYear(),
    };
  });
}

const SALES = sampleSales();
const RANGES = { Hoy: 0, '7 días': 7, '30 días': 30, Todo: 9999 } as const;
type Range = keyof typeof RANGES;
const STATUSES = ['Todos', 'Pagado', 'Pendiente', 'Vencido'] as const;
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
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('30 días');
  const [status, setStatus] = useState<StatusFilter>('Todos');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  // Any filter change resets paging and selection so no hidden row stays selected.
  const refilter = (fn: () => void) => {
    fn();
    setPage(1);
    setSel({});
  };

  const q = client.trim().toLowerCase();
  const base = SALES.filter(r => r.days <= RANGES[range] && (!q || r.client.toLowerCase().includes(q) || r.ruc.includes(q)));
  const list = base.filter(r => status === 'Todos' || r.status === status);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * size, cur * size);
  const selCount = Object.values(sel).filter(Boolean).length;
  const allOn = slice.length > 0 && slice.every(r => sel[r.id]);
  const hasFilters = range !== '30 días' || status !== 'Todos' || !!q;

  const rangeStart = new Date(TODAY);
  rangeStart.setDate(rangeStart.getDate() - Math.min(RANGES[range], 45));
  const rangeLabel = range === 'Todo' ? 'Todo el historial' : range === 'Hoy' ? '02 oct 2026' : fmtDay(rangeStart) + ' – 02 oct 2026';

  const clear = () => refilter(() => { setRange('30 días'); setStatus('Todos'); setClient(''); });

  return (
    <AppShell
      active="Órdenes de venta"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Ventas' }, { label: 'Órdenes de venta' }]}
      actions={
        <button type="button" className="btn btn--primary" onClick={() => navigate('/ventas/cotizaciones')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Nueva venta
        </button>
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Órdenes de venta</h1>
          <div className="page__subtitle">Órdenes de venta, comprobantes y estado de cobro</div>
        </div>
        <button type="button" className="btn btn--sm">
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
            <input value={client} onChange={e => refilter(() => setClient(e.target.value))} placeholder="Nombre o RUC del cliente" />
          </label>
        </div>
        {hasFilters && <button type="button" className="link-btn" onClick={clear}>Limpiar filtros</button>}
      </section>

      <section className="panel">
        <div className="panel__head" style={{ minHeight: 44, padding: '8px 16px', gap: 12 }}>
          {selCount === 0 ? (
            <>
              <span className="panel__title">{list.length} órdenes</span>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>
                Total filtrado <span className="mono" style={{ color: 'var(--text)' }}>{formatMoney(list.reduce((a, r) => a + r.total, 0))}</span>
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 500 }}>{selCount} seleccionadas</span>
              <button type="button" className="bulk-btn">Descargar PDF</button>
              <button type="button" className="bulk-btn">Enviar por correo</button>
              <button type="button" className="bulk-btn" style={{ color: 'var(--red)' }}>Anular</button>
            </>
          )}
          <span className="panel__hint" style={{ marginLeft: 'auto' }}>Montos en soles · IGV 18%</span>
        </div>

        <div role="table">
          <div role="row" className="vrow vrow--head" style={{ gridTemplateColumns: COLS }}>
            <Check on={allOn} label="Seleccionar página" onClick={() => setSel(s => ({ ...s, ...Object.fromEntries(slice.map(r => [r.id, !allOn])) }))} />
            <span>#Orden</span><span>Cliente</span><span>Productos</span><span className="t-right">Subtotal</span><span className="t-right">IGV</span><span className="t-right">Total</span><span>Estado</span><span className="t-right">Acciones</span>
          </div>
          {slice.map(r => {
            const sub = r.total / 1.18;
            return (
              <div key={r.id} role="row" className={'vrow' + (sel[r.id] ? ' is-selected' : '')} style={{ gridTemplateColumns: COLS }}>
                <Check on={!!sel[r.id]} label={'Seleccionar ' + r.id} onClick={() => setSel(s => ({ ...s, [r.id]: !s[r.id] }))} />
                <div style={{ minWidth: 0 }}>
                  <Link to="/ventas/orden" className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.id}</Link>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{r.date}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{r.client}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>RUC {r.ruc}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ color: 'var(--text-2)' }}>{r.product}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.more}</div>
                </div>
                <span className="mono t-right vrow__num" style={{ color: 'var(--text-2)' }}>{formatMoney(sub)}</span>
                <span className="mono t-right vrow__num" style={{ color: 'var(--muted)' }}>{formatMoney(r.total - sub)}</span>
                <span className="mono t-right" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMoney(r.total)}</span>
                <span><StatusChip label={r.status} tone={TONE[r.status]} /></span>
                <div className="row-actions">
                  <button type="button" title="Ver detalle" onClick={() => navigate('/ventas/orden')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                  <button type="button" title="Descargar comprobante" onClick={() => navigate('/documentos')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                  </button>
                  <button type="button" title="Más acciones">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && (
          <div className="table__empty">
            No hay ventas que coincidan con los filtros. <a onClick={clear} style={{ cursor: 'pointer' }}>Limpiar filtros</a>
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
    </AppShell>
  );
}
