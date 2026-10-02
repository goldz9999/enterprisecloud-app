import { Fragment, useState } from 'react';
import { AppShell } from '../components/AppShell';
import './ReportesPage.css';

const S = (n: number) => 'S/ ' + Math.round(n).toLocaleString('en-US');
const pct1 = (n: number) => n.toFixed(1) + '%';

const MON = ['oct 25', 'nov', 'dic', 'ene 26', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep'];
const SALES = [61240, 64810, 79530, 58320, 55140, 62710, 66420, 70180, 68940, 73510, 75230, 75120];
const PREV = [55100, 57900, 71200, 54800, 52300, 56100, 59800, 62400, 61900, 64700, 66200, 67100];
const ORDERS = [112, 118, 141, 104, 99, 113, 120, 126, 124, 131, 135, 133];
const CLIENTS: [string, number][] = [['Minera Los Andes S.A.', 142380], ['Distribuidora Andina S.A.C.', 118920], ['Constructora Pacífico E.I.R.L.', 96410], ['Comercial Norte Trujillo S.A.', 71250], ['Agroexportadora Ica S.A.C.', 58730], ['Clínica San Gabriel S.A.', 44120], ['Textil Arequipa S.R.L.', 38960], ['Ferretería El Constructor E.I.R.L.', 29840]];
const SUPPLIERS: [string, number][] = [['Aceros del Sur S.A.C.', 128400], ['Cementos Pacasmayo Dist. S.A.', 97250], ['Plásticos Lima S.R.L.', 61830], ['EPP Seguridad Total S.A.C.', 38420], ['Pinturas Andinas S.A.', 27190], ['Cables y Conductores Perú S.A.', 21960]];
const AGING: [string, number, string][] = [['Por vencer', 14200, 'var(--accent)'], ['1–30 días', 9800, 'var(--green)'], ['31–60 días', 5350, 'var(--amber)'], ['61–90 días', 1450, 'var(--red)'], ['> 90 días', 600, 'var(--text-2)']];
const DEBT: [string, string, number, string][] = [['Comercial Norte Trujillo S.A.', 'F001-00219', 7820, '1–30 días'], ['Constructora Pacífico E.I.R.L.', 'F001-00244', 8920.5, 'Por vencer'], ['Farmacias Salud Total S.A.C.', 'F001-00234', 3145.9, '1–30 días'], ['Inversiones Cusco Plaza S.A.C.', 'F001-00187', 2930, '31–60 días'], ['Textil Arequipa S.R.L.', 'F001-00201', 2420, '31–60 días'], ['Ferretería El Constructor E.I.R.L.', 'F001-00152', 1450, '61–90 días'], ['Clínica San Gabriel S.A.', 'F001-00098', 600, '> 90 días']];
// [sku, product, stock, unit cost, units sold in 90 days, ABC class]
const ROTATION: [string, string, number, number, number, string][] = [['SKU-CEM-0042', 'Cemento Portland Tipo I 42.5 kg', 18, 28.5, 1840, 'A'], ['SKU-FIE-0912', 'Fierro corrugado 1/2" x 9 m', 240, 41.2, 1320, 'A'], ['SKU-PVC-0410', 'Tubo PVC 4" x 3 m clase 10', 9, 36.9, 410, 'A'], ['SKU-LAD-1818', 'Ladrillo King Kong 18 huecos', 5200, 0.92, 22400, 'B'], ['SKU-PIN-0004', 'Pintura látex blanco 4 L', 86, 52.3, 214, 'B'], ['SKU-CAB-1200', 'Cable THW 12 AWG x 100 m', 34, 189, 58, 'C'], ['SKU-EPP-1103', 'Guantes de nitrilo talla M x100', 12, 24.6, 96, 'C'], ['SKU-EPP-0201', 'Casco de seguridad ANSI', 140, 18.4, 62, 'C']];
const TOTAL_SALES_12M = 811190;
const TOTAL_PURCHASES_12M = 412000;

type ReportId = 'vm' | 'vc' | 'cp' | 'ri' | 'cxc';
const CATALOG: { area: string; items: { id: ReportId; name: string; sub: string }[] }[] = [
  { area: 'Comercial', items: [{ id: 'vm', name: 'Ventas por mes', sub: 'Evolución y comparación anual' }, { id: 'vc', name: 'Ventas por cliente', sub: 'Ranking de facturación' }] },
  { area: 'Compras', items: [{ id: 'cp', name: 'Compras por proveedor', sub: 'Concentración de compras' }] },
  { area: 'Inventario', items: [{ id: 'ri', name: 'Rotación de inventario', sub: 'Días de stock y clasificación ABC' }] },
  { area: 'Finanzas', items: [{ id: 'cxc', name: 'Antigüedad de cuentas por cobrar', sub: 'Saldos por tramo de vencimiento' }] },
];

/** Table cell: value plus optional styling (mono numbers default to 12px). */
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
}

const num = (v: string | number): Cell => ({ v, right: true, mono: true });
const muted = (v: string | number): Cell => ({ v, right: true, mono: true, color: 'var(--muted)' });

function build(id: ReportId): Report {
  if (id === 'vm') {
    const tot = SALES.reduce((a, b) => a + b, 0);
    const prev = PREV.reduce((a, b) => a + b, 0);
    const ords = ORDERS.reduce((a, b) => a + b, 0);
    const growth = (tot / prev - 1) * 100;
    const rows: Report['rows'] = SALES.map((v, i) => {
      const d = (v / PREV[i] - 1) * 100;
      return {
        cells: [
          { v: MON[i], mono: true, color: 'var(--text-2)' }, num(ORDERS[i]), muted(S(v / 1.18)), muted(S(v - v / 1.18)), num(S(v)), muted(S(v / ORDERS[i])),
          { v: (d >= 0 ? '+' : '') + pct1(d), right: true, mono: true, color: d >= 0 ? 'var(--green)' : 'var(--red)' },
        ],
      };
    });
    rows.push({ total: true, cells: [{ v: 'Total' }, num(ords), num(S(tot / 1.18)), num(S(tot - tot / 1.18)), num(S(tot)), num(S(tot / ords)), { v: '+' + pct1(growth), right: true, mono: true, color: 'var(--green)' }] });
    return {
      area: 'Comercial', name: 'Ventas por mes', source: 'Ventas, Facturación',
      desc: 'Total vendido por mes con IGV desglosado, número de órdenes y ticket promedio. Útil para seguimiento mensual y comparar con el año anterior.',
      kpis: [
        { label: 'Ventas 12 meses', value: S(tot), note: '+' + pct1(growth) + ' vs. periodo anterior', noteColor: 'var(--green)' },
        { label: 'Órdenes', value: ords.toLocaleString('en-US'), note: 'promedio ' + Math.round(ords / 12) + ' por mes', noteColor: 'var(--muted)' },
        { label: 'Ticket promedio', value: S(tot / ords), note: 'mejor mes: dic 25', noteColor: 'var(--muted)' },
      ],
      cols: '72px 64px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 72px',
      heads: [['Mes'], ['Órdenes', true], ['Subtotal', true], ['IGV', true], ['Total', true], ['Ticket prom.', true], ['Var. anual', true]],
      rows,
    };
  }
  if (id === 'vc' || id === 'cp') {
    const sales = id === 'vc';
    const src = sales ? CLIENTS : SUPPLIERS;
    const base = sales ? TOTAL_SALES_12M : TOTAL_PURCHASES_12M;
    const tot = src.reduce((a, b) => a + b[1], 0);
    const max = src[0][1];
    return {
      area: sales ? 'Comercial' : 'Compras',
      name: sales ? 'Ventas por cliente' : 'Compras por proveedor',
      source: sales ? 'Ventas, Clientes' : 'Compras, Proveedores',
      desc: sales
        ? 'Clientes ordenados por monto facturado en el periodo. Ayuda a identificar concentración de ingresos y clientes clave.'
        : 'Proveedores ordenados por monto comprado. Permite detectar dependencia de pocos proveedores y negociar condiciones.',
      kpis: sales
        ? [
            { label: 'Clientes con compras', value: '64', note: '8 nuevos en el periodo', noteColor: 'var(--green)' },
            { label: 'Top 8 clientes', value: S(tot), note: Math.round((tot / base) * 100) + '% de las ventas', noteColor: 'var(--muted)' },
            { label: 'Cliente principal', value: Math.round((max / base) * 100) + '%', note: 'Minera Los Andes S.A.', noteColor: 'var(--muted)' },
          ]
        : [
            { label: 'Proveedores activos', value: '23', note: '2 nuevos en el periodo', noteColor: 'var(--muted)' },
            { label: 'Top 6 proveedores', value: S(tot), note: Math.round((tot / base) * 100) + '% de las compras', noteColor: 'var(--muted)' },
            { label: 'Proveedor principal', value: Math.round((max / base) * 100) + '%', note: 'Riesgo de dependencia moderado', noteColor: 'var(--amber)' },
          ],
      ranking: src.map(([name, v]) => ({ name, amount: S(v), w: (v / max) * 100 + '%', pct: pct1((v / base) * 100) })),
      cols: '28px minmax(0, 1fr) 120px 120px 90px',
      heads: [['#'], [sales ? 'Cliente' : 'Proveedor'], ['Órdenes', true], ['Monto', true], ['Participación', true]],
      rows: src.map(([name, v], i) => ({ cells: [{ v: i + 1, mono: true, color: 'var(--faint)' }, { v: name }, num(Math.round(v / 6200)), num(S(v)), muted(pct1((v / base) * 100))] })),
    };
  }
  if (id === 'cxc') {
    const tot = AGING.reduce((a, b) => a + b[1], 0);
    const colorOf = Object.fromEntries(AGING.map(([label, , c]) => [label, c === 'var(--accent)' ? 'var(--blue)' : c]));
    return {
      area: 'Finanzas', name: 'Antigüedad de cuentas por cobrar', source: 'Finanzas, Ventas',
      desc: 'Saldos pendientes de cobro agrupados por días de vencimiento. Prioriza la gestión de cobranza sobre los tramos más antiguos.',
      kpis: [
        { label: 'Saldo por cobrar', value: S(tot), note: '18 facturas abiertas', noteColor: 'var(--muted)' },
        { label: 'Vencido', value: S(tot - AGING[0][1]), note: Math.round(((tot - AGING[0][1]) / tot) * 100) + '% del saldo', noteColor: 'var(--amber)' },
        { label: 'Días promedio de cobro', value: '34 días', note: 'meta: 30 días', noteColor: 'var(--red)' },
      ],
      cols: 'minmax(0, 1fr) 110px 110px 110px',
      heads: [['Cliente'], ['Factura'], ['Tramo'], ['Saldo', true]],
      rows: DEBT.map(([client, inv, v, tramo]) => ({ cells: [{ v: client }, { v: inv, mono: true, color: 'var(--text-2)' }, { v: tramo, size: 12, color: colorOf[tramo] }, num(S(v))] })),
    };
  }
  return {
    area: 'Inventario', name: 'Rotación de inventario', source: 'Inventario, Kardex, Ventas',
    desc: 'Veces que el stock se renueva al año y días promedio en almacén por producto, con clasificación ABC por valor vendido. Días muy bajos indican riesgo de quiebre; muy altos, sobrestock.',
    kpis: [
      { label: 'Rotación promedio', value: '4.2×', note: 'anual', noteColor: 'var(--muted)' },
      { label: 'Días en almacén', value: '87 días', note: 'promedio ponderado', noteColor: 'var(--muted)' },
      { label: 'Valor del inventario', value: S(ROTATION.reduce((a, r) => a + r[2] * r[3], 0)), note: '3 productos con sobrestock', noteColor: 'var(--amber)' },
    ],
    cols: 'minmax(160px, 1fr) 52px 88px 72px 64px 52px 32px',
    heads: [['Producto'], ['Stock', true], ['Valorizado', true], ['Venta 90 d', true], ['Rotación', true], ['Días', true], ['ABC', true]],
    rows: ROTATION.map(([, name, stock, cost, sold, abc]) => {
      const turns = sold / Math.max(stock, 1);
      const days = Math.round(90 / turns);
      return {
        cells: [
          { v: name }, num(stock.toLocaleString('en-US')), muted(S(stock * cost)), num(sold.toLocaleString('en-US')), num((turns * 4).toFixed(1) + '×'),
          { v: days + ' d', right: true, mono: true, color: days > 120 ? 'var(--red)' : days < 5 ? 'var(--amber)' : 'var(--text)' },
          { v: abc, right: true, mono: true, color: abc === 'A' ? 'var(--green)' : abc === 'B' ? 'var(--blue)' : 'var(--muted)' },
        ],
      };
    }),
  };
}

const CHART_MAX = 90000;

function MonthlyChart({ compare }: { compare: boolean }) {
  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div className="chart-legend">
        <span><span style={{ background: 'var(--accent)' }} />Ventas</span>
        {compare && <span><span style={{ background: 'var(--border-strong)' }} />Año anterior</span>}
      </div>
      <div className="barchart" role="img" aria-label="Ventas por mes, últimos 12 meses">
        {[20000, 40000, 60000, 80000].map(v => (
          <div key={v} className="barchart__grid" style={{ bottom: (v / CHART_MAX) * 100 + '%' }}>
            <span className="mono">{v / 1000}k</span>
          </div>
        ))}
        <div className="barchart__bars">
          {SALES.map((v, i) => (
            <div key={MON[i]} className="barchart__slot" title={`${MON[i]}: ${S(v)} (año anterior ${S(PREV[i])})`}>
              {compare && <div className="barchart__prev" style={{ height: (PREV[i] / CHART_MAX) * 100 + '%' }} />}
              <div className="barchart__bar" style={{ height: (v / CHART_MAX) * 100 + '%', background: i === 2 ? 'var(--accent)' : 'rgba(59, 130, 246, .75)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="barchart__labels">
        {MON.map(m => <span key={m} className="mono">{m}</span>)}
      </div>
    </div>
  );
}

export function ReportesPage() {
  const [id, setId] = useState<ReportId>('vm');
  const [compare, setCompare] = useState(false);
  const rep = build(id);
  const agingTotal = AGING.reduce((a, b) => a + b[1], 0);

  return (
    <AppShell active="Reportes" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Reportes' }]}>
      <div>
        <h1 className="page__title">Reportes</h1>
        <div className="page__subtitle">Reportes operativos y analíticos generados con los datos de todos los módulos</div>
      </div>

      <section className="split" style={{ gridTemplateColumns: '232px minmax(0, 1fr)' }}>
        <nav className="report-nav" aria-label="Catálogo de reportes">
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

        <div className="panel" style={{ minWidth: 0 }}>
          <div className="report-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rep.area}</div>
              <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', marginTop: 2 }}>{rep.name}</div>
              <div style={{ color: 'var(--muted)', marginTop: 4, textWrap: 'pretty' }}>{rep.desc}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {['PDF', 'Excel'].map(f => (
                <button key={f} type="button" className="btn btn--xs">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                  {f}
                </button>
              ))}
              <button type="button" className="btn btn--xs">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                Programar envío
              </button>
            </div>
          </div>

          <div className="report-bar">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Periodo</span>
            <select className="report-bar__select" aria-label="Periodo">
              <option>Últimos 12 meses (oct 2025 – sep 2026)</option><option>Año 2026</option><option>Año 2025</option>
            </select>
            {id === 'vm' && (
              <button type="button" role="switch" aria-checked={compare} className="switch-row switch-row--sm" onClick={() => setCompare(c => !c)}>
                <span className={'switch switch--sm' + (compare ? ' is-on' : '')}><span /></span>
                Comparar con año anterior
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>Generado 02 oct 2026, 10:46 · fuente: módulos {rep.source}</span>
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

          {id === 'vm' && <MonthlyChart compare={compare} />}

          {rep.ranking && (
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

          {id === 'cxc' && (
            <div className="aging">
              <div className="aging__bar" role="img" aria-label="Saldo por tramo de vencimiento">
                {AGING.map(([label, v, c]) => <div key={label} title={`${label}: ${S(v)}`} style={{ width: (v / agingTotal) * 100 + '%', background: c }} />)}
              </div>
              <div className="aging__legend">
                {AGING.map(([label, v, c]) => (
                  <div key={label}>
                    <span className="aging__label"><span style={{ background: c }} />{label}</span>
                    <span className="mono" style={{ fontSize: 13 }}>{S(v)}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{pct1((v / agingTotal) * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div className="rtable rtable--head" style={{ gridTemplateColumns: rep.cols }}>
              {rep.heads.map(([t, right]) => <span key={t} className={'ellipsis' + (right ? ' t-right' : '')}>{t}</span>)}
            </div>
            {rep.rows.map((r, i) => (
              <div key={i} className={'rtable' + (r.total ? ' rtable--total' : '')} style={{ gridTemplateColumns: rep.cols }}>
                {r.cells.map((c, j) => (
                  <span
                    key={j}
                    className={'ellipsis' + (c.right ? ' t-right' : '') + (c.mono ? ' mono' : '')}
                    style={{ fontSize: c.size ?? (c.mono ? 12 : 13), color: c.color ?? 'var(--text)' }}
                  >
                    {c.v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
