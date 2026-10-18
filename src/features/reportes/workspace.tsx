import { Fragment, useState } from 'react';
import { AppShell } from '@/shared/components/AppShell';
import { Modal } from '@/shared/components/Modal';
import { Toast, useToast } from '@/shared/components/Toast';
import { audit } from '@/data/domain/audit';
import { grossMargin, inventoryValue, livePurchases, liveSales, monthKey, openReceivables, recognizedAt } from '@/data/domain/metrics';
import { orderTotal } from '@/data/domain/orders';
import { currentUser, mutate, useDB } from '@/data/store';
import type { DB } from '@/data/types';
import { daysBetween, fmtDayMonth, fmtTime, MES, parseDate } from '@/shared/lib/dates';
import { downloadCsv } from '@/shared/lib/csv';
import './workspace.css';
import '@/shared/components/KpiCard.css';

const S = (n: number) => 'S/ ' + Math.round(n).toLocaleString('en-US');
const pct1 = (n: number) => (isFinite(n) ? n.toFixed(1) : '0.0') + '%';

type ReportId = 'vm' | 'vc' | 'cp' | 'ri' | 'cxc';
const CATALOG: { area: string; items: { id: ReportId; name: string; sub: string }[] }[] = [
  { area: 'Comercial', items: [{ id: 'vm', name: 'Ventas por mes', sub: 'Evolución y comparación anual' }, { id: 'vc', name: 'Ventas por cliente', sub: 'Ranking de facturación' }] },
  { area: 'Compras', items: [{ id: 'cp', name: 'Compras por proveedor', sub: 'Concentración de compras' }] },
  { area: 'Inventario', items: [{ id: 'ri', name: 'Rotación de inventario', sub: 'Días de stock y clasificación ABC' }] },
  { area: 'Finanzas', items: [{ id: 'cxc', name: 'Antigüedad de cuentas por cobrar', sub: 'Saldos por tramo de vencimiento' }] },
];

/** Reporting window: 12 months ending this month, or a calendar year. */
type Window = { label: string; months: Date[] };
function windows(): Window[] {
  const now = new Date();
  const last12 = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
  const year = (y: number) => Array.from({ length: 12 }, (_, i) => new Date(y, i, 1));
  const lbl = (d: Date) => `${MES[d.getMonth()]} ${d.getFullYear()}`;
  return [
    { label: `Últimos 12 meses (${lbl(last12[0])} – ${lbl(last12[11])})`, months: last12 },
    { label: `Año ${now.getFullYear()}`, months: year(now.getFullYear()) },
    { label: `Año ${now.getFullYear() - 1}`, months: year(now.getFullYear() - 1) },
  ];
}

const inWindow = (t: Date, w: Window) => {
  const start = w.months[0];
  const end = new Date(w.months[11].getFullYear(), w.months[11].getMonth() + 1, 1);
  return t >= start && t < end;
};

/** Ventas facturadas del mes (ver liveSales en metrics.ts). */
function monthly(d: DB, m: Date) {
  const key = monthKey(m);
  const live = liveSales(d).filter(o => monthKey(recognizedAt(d, o)) === key);
  return { total: live.reduce((a, o) => a + orderTotal(o), 0), orders: live.length };
}

/** Cell: value plus optional styling (mono numbers default to 12px). */
interface Cell { v: string | number; right?: boolean; mono?: boolean; color?: string; size?: number }
interface Report {
  area: string;
  name: string;
  source: string;
  desc: string;
  kpis: { label: string; value: string; note: string; noteColor: string }[];
  cols: string;
  heads: [string, boolean?][];
  rows: { cells: Cell[]; total?: boolean }[];
  ranking?: { name: string; amount: string; w: string; pct: string }[];
  buckets?: { label: string; amount: number; color: string }[];
  empty?: string;
}

const num = (v: string | number): Cell => ({ v, right: true, mono: true });
const muted = (v: string | number): Cell => ({ v, right: true, mono: true, color: 'var(--muted)' });

function build(id: ReportId, d: DB, w: Window): Report {
  if (id === 'vm') {
    const data = w.months.map(m => ({ m, ...monthly(d, m), prev: monthly(d, new Date(m.getFullYear() - 1, m.getMonth(), 1)) }));
    const tot = data.reduce((a, x) => a + x.total, 0);
    const prev = data.reduce((a, x) => a + x.prev.total, 0);
    const ords = data.reduce((a, x) => a + x.orders, 0);
    const growth = prev ? (tot / prev - 1) * 100 : 0;
    const best = data.reduce((a, x) => (x.total > a.total ? x : a), data[0]);
    const rows: Report['rows'] = data.map(x => {
      const dv = x.prev.total ? (x.total / x.prev.total - 1) * 100 : null;
      return {
        cells: [
          { v: `${MES[x.m.getMonth()]} ${String(x.m.getFullYear()).slice(2)}`, mono: true, color: 'var(--text-2)' }, num(x.orders), muted(S(x.total / 1.18)), muted(S(x.total - x.total / 1.18)), num(S(x.total)), muted(x.orders ? S(x.total / x.orders) : '—'),
          dv == null ? muted('—') : { v: (dv >= 0 ? '+' : '') + pct1(dv), right: true, mono: true, color: dv >= 0 ? 'var(--green)' : 'var(--red)' },
        ],
      };
    });
    rows.push({ total: true, cells: [{ v: 'Total' }, num(ords), num(S(tot / 1.18)), num(S(tot - tot / 1.18)), num(S(tot)), num(ords ? S(tot / ords) : '—'), prev ? { v: (growth >= 0 ? '+' : '') + pct1(growth), right: true, mono: true, color: growth >= 0 ? 'var(--green)' : 'var(--red)' } : muted('—')] });
    return {
      area: 'Comercial', name: 'Ventas por mes', source: 'Ventas, Comprobantes',
      desc: 'Total facturado por mes con IGV desglosado, número de ventas y ticket promedio. Solo cuentan las ventas con comprobante emitido (las órdenes pendientes, confirmadas o despachadas sin facturar no suman), en el mes de emisión del comprobante.',
      kpis: [
        { label: 'Ventas del periodo', value: S(tot), note: prev ? (growth >= 0 ? '+' : '') + pct1(growth) + ' vs. periodo anterior' : 'sin periodo anterior', noteColor: growth >= 0 ? 'var(--green)' : 'var(--red)' },
        { label: 'Ventas facturadas', value: ords.toLocaleString('en-US'), note: 'promedio ' + Math.round(ords / 12) + ' por mes', noteColor: 'var(--muted)' },
        { label: 'Ticket promedio', value: ords ? S(tot / ords) : '—', note: best?.total ? `mejor mes: ${MES[best.m.getMonth()]} ${String(best.m.getFullYear()).slice(2)}` : '—', noteColor: 'var(--muted)' },
      ],
      cols: '72px 64px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 72px',
      heads: [['Mes'], ['Ventas', true], ['Subtotal', true], ['IGV', true], ['Total', true], ['Ticket prom.', true], ['Var. anual', true]],
      rows,
      empty: tot ? undefined : 'Aún no hay ventas facturadas en este periodo.',
    };
  }
  if (id === 'vc' || id === 'cp') {
    const sales = id === 'vc';
    const totals = new Map<string, { amount: number; orders: number }>();
    for (const o of (sales ? liveSales(d) : livePurchases(d)).filter(o => inWindow(recognizedAt(d, o), w))) {
      const t = totals.get(o.party.name) ?? { amount: 0, orders: 0 };
      totals.set(o.party.name, { amount: t.amount + orderTotal(o), orders: t.orders + 1 });
    }
    const src = [...totals.entries()].filter(([, t]) => t.amount > 0).sort((a, b) => b[1].amount - a[1].amount);
    const base = src.reduce((a, [, t]) => a + t.amount, 0);
    const max = src[0]?.[1].amount ?? 0;
    const top = src.slice(0, 8);
    const topTotal = top.reduce((a, [, t]) => a + t.amount, 0);
    return {
      area: sales ? 'Comercial' : 'Compras',
      name: sales ? 'Ventas por cliente' : 'Compras por proveedor',
      source: sales ? 'Ventas, Clientes' : 'Compras, Proveedores',
      desc: sales ? 'Clientes ordenados por monto facturado en el periodo (solo ventas con comprobante emitido). Ayuda a identificar concentración de ingresos y clientes clave.' : 'Proveedores ordenados por monto comprado (solo compras con factura del proveedor registrada). Permite detectar dependencia de pocos proveedores y negociar condiciones.',
      kpis: [
        { label: sales ? 'Clientes con compras' : 'Proveedores con compras', value: String(src.length), note: `de ${(sales ? d.records.clientes : d.records.proveedores).length} registrados`, noteColor: 'var(--muted)' },
        { label: `Top ${top.length}`, value: S(topTotal), note: Math.round((topTotal / (base || 1)) * 100) + (sales ? '% de las ventas' : '% de las compras'), noteColor: 'var(--muted)' },
        { label: sales ? 'Cliente principal' : 'Proveedor principal', value: Math.round((max / (base || 1)) * 100) + '%', note: src[0]?.[0] ?? '—', noteColor: !sales && max / (base || 1) > 0.3 ? 'var(--amber)' : 'var(--muted)' },
      ],
      ranking: top.map(([name, t]) => ({ name, amount: S(t.amount), w: (t.amount / (max || 1)) * 100 + '%', pct: pct1((t.amount / (base || 1)) * 100) })),
      cols: '28px minmax(0, 1fr) 120px 120px 90px',
      heads: [['#'], [sales ? 'Cliente' : 'Proveedor'], [sales ? 'Ventas' : 'Compras', true], ['Monto', true], ['Participación', true]],
      rows: src.map(([name, t], i) => ({ cells: [{ v: i + 1, mono: true, color: 'var(--faint)' }, { v: name }, num(t.orders), num(S(t.amount)), muted(pct1((t.amount / (base || 1)) * 100))] })),
      empty: src.length ? undefined : sales ? 'Aún no hay ventas facturadas en este periodo.' : 'Aún no hay compras con factura registrada en este periodo.',
    };
  }
  if (id === 'cxc') {
    const today = new Date();
    const tramo = (vence: string) => {
      const due = parseDate(vence);
      const late = due ? daysBetween(due, today) : 0;
      return late <= 0 ? 'Por vencer' : late <= 30 ? '1–30 días' : late <= 60 ? '31–60 días' : late <= 90 ? '61–90 días' : '> 90 días';
    };
    const COLORS: Record<string, string> = { 'Por vencer': 'var(--accent)', '1–30 días': 'var(--green)', '31–60 días': 'var(--amber)', '61–90 días': 'var(--red)', '> 90 días': 'var(--text-2)' };
    const open = openReceivables(d).map(r => ({ r, t: tramo(String(r.vence)) }));
    const buckets = Object.keys(COLORS).map(label => ({ label, amount: open.filter(x => x.t === label).reduce((a, x) => a + Number(x.r.saldo), 0), color: COLORS[label] }));
    const tot = buckets.reduce((a, b) => a + b.amount, 0);
    const overdue = tot - buckets[0].amount;
    return {
      area: 'Finanzas', name: 'Antigüedad de cuentas por cobrar', source: 'Finanzas, Ventas',
      desc: 'Saldos pendientes de cobro agrupados por días de vencimiento. Prioriza la gestión de cobranza sobre los tramos más antiguos.',
      kpis: [
        { label: 'Saldo por cobrar', value: S(tot), note: `${open.length} documentos abiertos`, noteColor: 'var(--muted)' },
        { label: 'Vencido', value: S(overdue), note: Math.round((overdue / (tot || 1)) * 100) + '% del saldo', noteColor: 'var(--amber)' },
        { label: 'Clientes con deuda vencida', value: String(new Set(open.filter(x => x.t !== 'Por vencer').map(x => x.r.cliente)).size), note: 'priorizar cobranza', noteColor: 'var(--red)' },
      ],
      buckets,
      cols: 'minmax(0, 1fr) 110px 110px 110px',
      heads: [['Cliente'], ['Documento'], ['Tramo'], ['Saldo', true]],
      rows: open.sort((a, b) => Number(b.r.saldo) - Number(a.r.saldo)).map(({ r, t }) => ({ cells: [{ v: String(r.cliente) }, { v: String(r.doc), mono: true, color: 'var(--text-2)' }, { v: t, size: 12, color: COLORS[t] === 'var(--accent)' ? 'var(--blue)' : COLORS[t] }, num(S(Number(r.saldo)))] })),
      empty: open.length ? undefined : 'No hay cuentas por cobrar abiertas.',
    };
  }
  // Rotation: stock on hand vs. units sold in the last 90 days (kardex exits).
  const since = new Date(Date.now() - 90 * 86400000);
  const sold = new Map<string, number>();
  for (const k of d.records.kardex) {
    const t = k.at ? new Date(String(k.at)) : parseDate(String(k.fecha));
    if (k.tipo === 'Salida' && t && t >= since) sold.set(String(k.sku), (sold.get(String(k.sku)) ?? 0) - Number(k.cant));
  }
  const products = d.records.productos.map(p => {
    const stock = d.records.stock.filter(s => s.sku === p.sku).reduce((a, s) => a + Number(s.stock), 0);
    const s90 = sold.get(String(p.sku)) ?? 0;
    return { p, stock, value: stock * Number(p.costo), s90, soldValue: s90 * Number(p.precio) };
  });
  // ABC by value sold: A = top 80 %, B = next 15 %, C = rest.
  const ranked = [...products].sort((a, b) => b.soldValue - a.soldValue);
  const totalSold = ranked.reduce((a, x) => a + x.soldValue, 0);
  let acc = 0;
  const abc = new Map<string, string>();
  for (const x of ranked) {
    acc += x.soldValue;
    abc.set(String(x.p.sku), !x.soldValue ? 'C' : acc / (totalSold || 1) <= 0.8 ? 'A' : acc / (totalSold || 1) <= 0.95 ? 'B' : 'C');
  }
  const inv = inventoryValue(d);
  const weighted = products.reduce((a, x) => a + x.s90 * Number(x.p.costo) * 4, 0) / (inv || 1);
  return {
    area: 'Inventario', name: 'Rotación de inventario', source: 'Inventario, Kardex, Ventas',
    desc: 'Veces que el stock se renueva al año y días promedio en almacén por producto, con clasificación ABC por valor vendido. Días muy bajos indican riesgo de quiebre; muy altos, sobrestock.',
    kpis: [
      { label: 'Rotación promedio', value: inv ? weighted.toFixed(1) + '×' : '—', note: 'anual, ponderada por costo', noteColor: 'var(--muted)' },
      { label: 'Días en almacén', value: inv && weighted ? Math.round(365 / weighted) + ' días' : '—', note: `margen bruto ${(grossMargin(d) * 100).toFixed(1)}%`, noteColor: 'var(--muted)' },
      { label: 'Valor del inventario', value: S(inv), note: `${d.records.stock.filter(s => s.estado === 'Sobrestock').length} con sobrestock`, noteColor: 'var(--amber)' },
    ],
    cols: 'minmax(160px, 1fr) 52px 88px 72px 64px 52px 32px',
    heads: [['Producto'], ['Stock', true], ['Valorizado', true], ['Venta 90 d', true], ['Rotación', true], ['Días', true], ['ABC', true]],
    rows: products.map(({ p, stock, value, s90 }) => {
      const turns = s90 / Math.max(stock, 1);
      const days = s90 ? Math.round(90 / turns) : null;
      const cls = abc.get(String(p.sku)) ?? 'C';
      return {
        cells: [
          { v: String(p.nombre) }, num(stock.toLocaleString('en-US')), muted(S(value)), num(s90.toLocaleString('en-US')), num((turns * 4).toFixed(1) + '×'),
          days == null ? muted('—') : { v: days + ' d', right: true, mono: true, color: days > 120 ? 'var(--red)' : days < 5 ? 'var(--amber)' : 'var(--text)' },
          { v: cls, right: true, mono: true, color: cls === 'A' ? 'var(--green)' : cls === 'B' ? 'var(--blue)' : 'var(--muted)' },
        ],
      };
    }),
    empty: products.length ? undefined : 'Aún no hay productos registrados.',
  };
}

const CHART_STEPS = [0.25, 0.5, 0.75, 1];

function MonthlyChart({ d, w, compare }: { d: DB; w: Window; compare: boolean }) {
  const data = w.months.map(m => ({ m, total: monthly(d, m).total, prev: monthly(d, new Date(m.getFullYear() - 1, m.getMonth(), 1)).total }));
  const peak = Math.max(1, ...data.map(x => x.total), ...(compare ? data.map(x => x.prev) : []));
  // Round the axis up to a "nice" number.
  const mag = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil((peak * 1.1) / mag) * mag;
  const best = data.reduce((a, x, i) => (x.total > data[a].total ? i : a), 0);
  const fmtAxis = (v: number) => (v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v)));
  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div className="chart-legend">
        <span><span style={{ background: 'var(--accent)' }} />Ventas</span>
        {compare && <span><span style={{ background: 'var(--border-strong)' }} />Año anterior</span>}
      </div>
      <div className="barchart" role="img" aria-label="Ventas por mes">
        {CHART_STEPS.map(f => (
          <div key={f} className="barchart__grid" style={{ bottom: f * 100 + '%' }}>
            <span className="mono">{fmtAxis(max * f)}</span>
          </div>
        ))}
        <div className="barchart__bars">
          {data.map((x, i) => (
            <div key={i} className="barchart__slot" title={`${MES[x.m.getMonth()]} ${x.m.getFullYear()}: ${S(x.total)} (año anterior ${S(x.prev)})`}>
              {compare && <div className="barchart__prev" style={{ height: (x.prev / max) * 100 + '%' }} />}
              <div className="barchart__bar" style={{ height: (x.total / max) * 100 + '%', background: i === best ? 'var(--accent)' : 'rgba(59, 130, 246, .75)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="barchart__labels">
        {data.map((x, i) => <span key={i} className="mono">{MES[x.m.getMonth()]}{x.m.getMonth() === 0 || i === 0 ? ' ' + String(x.m.getFullYear()).slice(2) : ''}</span>)}
      </div>
    </div>
  );
}

export function ReportesPage() {
  const d = useDB();
  const toast = useToast();
  const [id, setId] = useState<ReportId>('vm');
  const [compare, setCompare] = useState(false);
  const wins = windows();
  const [winIdx, setWinIdx] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [sched, setSched] = useState({ email: currentUser(d).email, freq: 'Mensual' });
  const w = wins[winIdx];
  const rep = build(id, d, w);
  const now = new Date();
  const agingTotal = rep.buckets?.reduce((a, b) => a + b.amount, 0) ?? 0;
  const hasPeriod = id === 'vm' || id === 'vc' || id === 'cp';

  const exportCsv = () => {
    downloadCsv(`reporte-${rep.name.toLowerCase().replace(/\s+/g, '-')}.csv`, rep.heads.map(h => h[0]), rep.rows.map(r => r.cells.map(c => c.v)));
    mutate(dr => audit(dr, { action: 'Exportar', module: 'Reportes', ref: rep.name, desc: `Reporte exportado a CSV · ${rep.rows.length} filas` }));
  };

  return (
    <AppShell active="Reportes" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Reportes' }]}>
      <div>
        <h1 className="page__title">Reportes</h1>
        <div className="page__subtitle">Reportes operativos y analíticos generados con los datos de todos los módulos</div>
      </div>

      <section className="split" style={{ gridTemplateColumns: '232px minmax(0, 1fr)' }}>
        <nav className="report-nav no-print" aria-label="Catálogo de reportes">
          {CATALOG.map(g => (
            <Fragment key={g.area}>
              <div className="report-nav__area">{g.area}</div>
              {g.items.map(it => (
                <button key={it.id} type="button" className={'report-nav__item' + (it.id === id ? ' is-on' : '')} aria-current={it.id === id || undefined} onClick={() => setId(it.id)}>
                  <span style={{ fontWeight: 500 }}>{it.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--faint)' }}>{it.sub}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="panel print-area" style={{ minWidth: 0 }}>
          <div className="report-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rep.area}</div>
              <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', marginTop: 2 }}>{rep.name}</div>
              <div style={{ color: 'var(--muted)', marginTop: 4, textWrap: 'pretty' }}>{rep.desc}</div>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" className="btn btn--xs" onClick={() => window.print()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                PDF
              </button>
              <button type="button" className="btn btn--xs" onClick={exportCsv}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                Excel
              </button>
              <button type="button" className="btn btn--xs" onClick={() => setScheduling(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                Programar envío
              </button>
            </div>
          </div>

          <div className="report-bar">
            {hasPeriod && (
              <>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Periodo</span>
                <select className="report-bar__select" aria-label="Periodo" value={winIdx} onChange={e => setWinIdx(Number(e.target.value))}>
                  {wins.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}
                </select>
              </>
            )}
            {id === 'vm' && (
              <button type="button" role="switch" aria-checked={compare} className="switch-row switch-row--sm" onClick={() => setCompare(c => !c)}>
                <span className={'switch switch--sm' + (compare ? ' is-on' : '')}><span /></span>
                Comparar con año anterior
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>Generado {fmtDayMonth(now)} {now.getFullYear()}, {fmtTime(now)} · fuente: módulos {rep.source}</span>
          </div>

          <div className="report-kpis">
            {rep.kpis.map(k => (
              <div key={k.label}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.label}</div>
                <div className="kpi__value">{k.value}</div>
                <div style={{ fontSize: 12, color: k.noteColor, marginTop: 2 }}>{k.note}</div>
              </div>
            ))}
          </div>

          {id === 'vm' && <MonthlyChart d={d} w={w} compare={compare} />}

          {rep.ranking && rep.ranking.length > 0 && (
            <div className="ranking">
              {rep.ranking.map((r, i) => (
                <div key={r.name} className="ranking__row" title={`${r.name}: ${r.amount} (${r.pct})`}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{i + 1}</span>
                  <span className="ellipsis">{r.name}</span>
                  <div className="ranking__track"><div style={{ width: r.w }} /></div>
                  <span className="mono t-right" style={{ fontSize: 12 }}>{r.amount}</span>
                  <span className="mono t-right" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.pct}</span>
                </div>
              ))}
            </div>
          )}

          {rep.buckets && agingTotal > 0 && (
            <div className="aging">
              <div className="aging__bar" role="img" aria-label="Saldo por tramo de vencimiento">
                {rep.buckets.filter(b => b.amount > 0).map(b => <div key={b.label} title={`${b.label}: ${S(b.amount)}`} style={{ width: (b.amount / agingTotal) * 100 + '%', background: b.color }} />)}
              </div>
              <div className="aging__legend">
                {rep.buckets.map(b => (
                  <div key={b.label}>
                    <span className="aging__label"><span style={{ background: b.color }} />{b.label}</span>
                    <span className="mono" style={{ fontSize: 13 }}>{S(b.amount)}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{pct1((b.amount / agingTotal) * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div className="rtable rtable--head" style={{ gridTemplateColumns: rep.cols }}>
              {rep.heads.map(([t, right]) => <span key={t} className={'ellipsis' + (right ? ' t-right' : '')}>{t}</span>)}
            </div>
            {rep.empty && <div className="table__empty">{rep.empty}</div>}
            {rep.rows.map((r, i) => (
              <div key={i} className={'rtable' + (r.total ? ' rtable--total' : '')} style={{ gridTemplateColumns: rep.cols }}>
                {r.cells.map((c, j) => (
                  <span key={j} className={'ellipsis' + (c.right ? ' t-right' : '') + (c.mono ? ' mono' : '')} style={{ fontSize: c.size ?? (c.mono ? 12 : 13), color: c.color ?? 'var(--text)' }}>
                    {c.v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {scheduling && (
        <Modal
          title="Programar envío del reporte"
          onClose={() => setScheduling(false)}
          footer={
            <>
              <button type="button" className="btn" style={{ height: 30 }} onClick={() => setScheduling(false)}>Cancelar</button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ height: 30, padding: '0 14px' }}
                onClick={() => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sched.email)) return toast.flash('Ingresa un correo válido');
                  mutate(dr => {
                    dr.reportSchedules = [...dr.reportSchedules.filter(s => s.report !== rep.name), { report: rep.name, ...sched }];
                    audit(dr, { action: 'Editar', module: 'Reportes', ref: rep.name, desc: `Envío ${sched.freq.toLowerCase()} programado a ${sched.email}` });
                  });
                  setScheduling(false);
                  toast.flash(`Envío ${sched.freq.toLowerCase()} programado`);
                }}
              >
                Guardar
              </button>
            </>
          }
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rep.name}</div>
          <label className="field">
            <span className="field__label">Enviar a</span>
            <input className="field__control" style={{ padding: '0 10px' }} value={sched.email} onChange={e => setSched(s => ({ ...s, email: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field__label">Frecuencia</span>
            <select className="field__control" value={sched.freq} onChange={e => setSched(s => ({ ...s, freq: e.target.value }))}>
              {['Diaria', 'Semanal', 'Mensual'].map(f => <option key={f}>{f}</option>)}
            </select>
          </label>
          {d.reportSchedules.length > 0 && (
            <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
              {d.reportSchedules.map(s => <span key={s.report}>{s.report}: {s.freq.toLowerCase()} a {s.email}</span>)}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--faint)' }}>En esta versión local la programación queda registrada, pero el correo no se envía (no hay servidor de correo).</div>
        </Modal>
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}