import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { StatusChip, type Tone } from '../components/StatusChip';
import './DashboardPage.css';

type SaleStatus = 'Pagado' | 'Pendiente' | 'Vencido';
const SALE_TONE: Record<SaleStatus, Tone> = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red' };

const SALES: { id: string; client: string; ruc: string; amount: string; status: SaleStatus; day: string; time: string }[] = [
  { id: 'OV-2026-1284', client: 'Distribuidora Andina S.A.C.', ruc: '20512345671', amount: 'S/ 12,480.00', status: 'Pagado', day: '02 oct', time: '10:42' },
  { id: 'OV-2026-1283', client: 'Constructora Pacífico E.I.R.L.', ruc: '20601122334', amount: 'S/ 8,920.50', status: 'Pendiente', day: '02 oct', time: '09:15' },
  { id: 'OV-2026-1282', client: 'Minera Los Andes S.A.', ruc: '20100987652', amount: 'S/ 21,300.00', status: 'Pagado', day: '01 oct', time: '17:03' },
  { id: 'OV-2026-1281', client: 'Farmacias Salud Total S.A.C.', ruc: '20488776651', amount: 'S/ 3,145.90', status: 'Vencido', day: '30 sep', time: '12:28' },
  { id: 'OV-2026-1280', client: 'Textil Arequipa S.R.L.', ruc: '20455667788', amount: 'S/ 6,760.00', status: 'Pendiente', day: '29 sep', time: '16:51' },
];

const LOW_STOCK = [
  { name: 'Cemento Portland Tipo I · 42.5 kg', sku: 'SKU-CEM-0042', wh: 'Almacén Lima', qty: 18, min: 120 },
  { name: 'Tubo PVC 4" x 3 m clase 10', sku: 'SKU-PVC-0410', wh: 'Almacén Callao', qty: 9, min: 40 },
  { name: 'Guantes de nitrilo talla M (caja x100)', sku: 'SKU-EPP-1103', wh: 'Almacén Lima', qty: 12, min: 30 },
];

const OVERDUE = [
  { client: 'Farmacias Salud Total S.A.C.', id: 'F001-00234', days: 5, amount: 'S/ 3,145.90' },
  { client: 'Comercial Norte Trujillo S.A.', id: 'F001-00219', days: 12, amount: 'S/ 7,820.00' },
];

const KPIS: { label: string; value: string; badge: string; note: string; tone: Tone; icon: string }[] = [
  { label: 'Ventas del mes', value: 'S/ 84,250', badge: '↑ 12%', note: 'vs. mes anterior', tone: 'green', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { label: 'Compras del mes', value: 'S/ 52,180', badge: '↑ 4%', note: '5 órdenes por recibir', tone: 'amber', icon: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
  { label: 'Utilidad bruta', value: 'S/ 32,070', badge: '38.1%', note: 'margen sobre ventas', tone: 'blue', icon: 'M3 3v18h18M8 17v-5M13 17V8M18 17V5' },
  { label: 'Productos con stock crítico', value: '7', badge: '↓ Crítico', note: 'necesita atención', tone: 'red', icon: 'M12 3l10 18H2zM12 10v4M12 17.5v.01' },
];

const SECONDARY = [
  { label: 'Cuentas por cobrar', note: '18 facturas · 2 vencidas', value: 'S/ 31,400', to: '/finanzas/cxc' },
  { label: 'Cuentas por pagar', note: '11 facturas · 3 vencen esta semana', value: 'S/ 24,860', to: '/finanzas/cxp' },
  { label: 'Rotación de inventario', note: '87 días promedio en almacén', value: '4.2×', to: '/inventario/kardex' },
];

const FILTERS = ['Todas', 'Pagado', 'Pendiente', 'Vencido'] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todas');
  const rows = SALES.filter(r => filter === 'Todas' || r.status === filter);

  return (
    <AppShell active="Dashboard" breadcrumb={[{ label: 'Inicio' }, { label: 'Dashboard' }]} searchPlaceholder="Buscar órdenes, clientes, productos, facturas…">
      <div className="page-head">
        <div>
          <h1 className="page__title">Buenos días, María</h1>
          <div className="page__subtitle">Resumen operativo · Octubre 2026</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="segmented" aria-label="Periodo">
            {['Hoy', 'Semana', 'Mes', 'Año'].map(p => <span key={p} className={p === 'Mes' ? 'is-on' : ''}>{p}</span>)}
          </div>
          <button type="button" className="btn btn--primary" style={{ height: 30 }} onClick={() => navigate('/ventas/cotizaciones')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Nueva venta
          </button>
        </div>
      </div>

      <section className="dash-kpis">
        {KPIS.map(k => (
          <div key={k.label} className="dash-kpi">
            <div className="dash-kpi__top">
              <span>{k.label}</span>
              <span className="dash-kpi__icon" style={{ background: `var(--${k.tone}-bg)` }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={`var(--${k.tone})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={k.icon} /></svg>
              </span>
            </div>
            <div className="dash-kpi__value">{k.value}</div>
            <div className="dash-kpi__foot">
              <span className={'dash-kpi__badge chip--' + k.tone}>{k.badge}</span>
              <span style={{ color: 'var(--muted)' }}>{k.note}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="dash-secondary">
        {SECONDARY.map(s => (
          <Link key={s.label} to={s.to} className="dash-stat">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 2 }}>{s.note}</div>
            </div>
            <div className="dash-stat__value">{s.value}</div>
          </Link>
        ))}
      </section>

      <section className="dash-bottom">
        <div className="panel">
          <div className="panel__head" style={{ padding: '12px 16px', gap: 12 }}>
            <div className="panel__title">Últimas ventas</div>
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              {FILTERS.map(f => (
                <button key={f} type="button" className={'mini-seg' + (filter === f ? ' is-on' : '')} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
            <Link to="/ventas/ordenes" style={{ marginLeft: 'auto', fontSize: 12 }}>Ver todas →</Link>
          </div>
          <div role="table">
            <div role="row" className="sales-row sales-row--head">
              <span>#Orden</span><span>Cliente</span><span className="t-right">Monto</span><span>Estado</span><span className="t-right">Fecha</span>
            </div>
            {rows.map(r => (
              <div key={r.id} role="row" className="sales-row sales-row--body" onClick={() => navigate('/ventas/orden')}>
                <span className="mono ellipsis" style={{ fontSize: 11.5, color: 'var(--text-2)', minWidth: 0 }}>{r.id}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{r.client}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>RUC {r.ruc}</div>
                </div>
                <span className="mono t-right" style={{ whiteSpace: 'nowrap' }}>{r.amount}</span>
                <span><StatusChip label={r.status} tone={SALE_TONE[r.status]} /></span>
                <div className="mono t-right" style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.day}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.time}</div>
                </div>
              </div>
            ))}
          </div>
          {rows.length === 0 && <div className="table__empty" style={{ padding: '32px 16px' }}>Sin ventas con este estado en el periodo.</div>}
          <div className="table__foot" style={{ alignItems: 'center' }}>
            <span>Mostrando {rows.length} de 1,284 órdenes</span>
            <div className="pager-static">
              <span>‹</span><span className="is-on">1</span><span>2</span><span>3</span><span>›</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__head" style={{ padding: '12px 16px' }}>
            <div className="panel__title">Alertas del sistema</div>
            <span className="count-badge">6</span>
            <a style={{ marginLeft: 'auto', fontSize: 12, cursor: 'pointer' }}>Marcar como leídas</a>
          </div>

          <div className="alert-group" style={{ borderTop: 0, marginTop: 0, paddingTop: 10 }}>
            <span className="alert-group__dot" style={{ background: 'var(--red)' }} />Stock bajo mínimo · 3
          </div>
          {LOW_STOCK.map(s => (
            <div key={s.sku} className="alert-row" onClick={() => navigate('/inventario/stock')}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 500 }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{s.sku} · {s.wh}</div>
              </div>
              <div className="stockbar">
                <span className="mono" style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--red)' }}>{s.qty}</span><span style={{ color: 'var(--faint)' }}> / {s.min}</span>
                </span>
                <div className="stockbar__track"><div style={{ width: Math.floor((s.qty / s.min) * 100) + '%' }} /></div>
              </div>
            </div>
          ))}

          <div className="alert-group">
            <span className="alert-group__dot" style={{ background: 'var(--amber)' }} />Facturas vencidas · 2
          </div>
          {OVERDUE.map(i => (
            <div key={i.id} className="alert-row" onClick={() => navigate('/finanzas/cxc')}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 500 }}>{i.client}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{i.id} · vencida hace {i.days} días</div>
              </div>
              <span className="mono" style={{ fontSize: 12 }}>{i.amount}</span>
            </div>
          ))}

          <div className="alert-group">
            <span className="alert-group__dot" style={{ background: 'var(--blue)' }} />Usuarios · 1
          </div>
          <div className="alert-row alert-row--static" style={{ paddingBottom: 14 }}>
            <div className="mini-avatar">JQ</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>Jorge Quispe sin confirmar</div>
              <div style={{ fontSize: 11, color: 'var(--faint)' }}>Invitado hace 4 días · Rol: Almacén</div>
            </div>
            <button type="button" className="btn-resend">Reenviar</button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
