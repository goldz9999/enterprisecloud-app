import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { StatusChip, type Tone } from '../components/StatusChip';
import { Toast, useToast } from '../components/Toast';
import { audit } from '../data/domain/audit';
import { alerts, criticalStock, grossMargin, openPayables, openReceivables, periodRange, purchasesIn, salesIn, turnover, type Period } from '../data/domain/metrics';
import { orderTotal, saleListStatus } from '../data/domain/orders';
import { can } from '../data/permissions';
import { currentUser, mutate, useDB } from '../data/store';
import { fmtDayMonth, fmtTime, MES } from '../lib/dates';
import { formatMoney } from '../lib/format';
import './DashboardPage.css';

const SALE_TONE: Record<string, Tone> = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red', Anulado: 'muted' };
const FILTERS = ['Todas', 'Pagado', 'Pendiente', 'Vencido'] as const;
const PERIODS: Period[] = ['Hoy', 'Semana', 'Mes', 'Año'];
const PERIOD_PREV: Record<Period, string> = { Hoy: 'vs. ayer', Semana: 'vs. semana anterior', Mes: 'vs. mes anterior', Año: 'vs. año anterior' };

const S0 = (n: number) => 'S/ ' + Math.round(n).toLocaleString('en-US');
const change = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 100 : 0);
const arrow = (n: number) => (n >= 0 ? '↑ ' : '↓ ') + Math.abs(n) + '%';

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function DashboardPage() {
  const d = useDB();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todas');
  const [period, setPeriod] = useState<Period>('Mes');
  const me = currentUser(d);
  const now = new Date();

  const { cur, prev } = periodRange(period, now);
  const sales = salesIn(d, cur);
  const salesPrev = salesIn(d, prev);
  const purchases = purchasesIn(d, cur);
  const purchasesPrev = purchasesIn(d, prev);
  const margin = grossMargin(d, sales.list.length ? sales.list : undefined);
  const profit = (sales.total / 1.18) * margin;
  const critical = criticalStock(d);
  const toReceive = d.orders.filter(o => o.kind === 'compra' && !o.cancelled && o.done === 2).length;
  const receivables = openReceivables(d);
  const payables = openPayables(d);
  const rot = turnover(d);
  const salesChange = change(sales.total, salesPrev.total);
  const purchChange = change(purchases.total, purchasesPrev.total);

  const kpis: { label: string; value: string; badge: string; note: string; tone: Tone; icon: string; to: string }[] = [
    { label: `Ventas · ${period.toLowerCase()}`, value: S0(sales.total), badge: arrow(salesChange), note: PERIOD_PREV[period], tone: salesChange >= 0 ? 'green' : 'red', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6', to: '/ventas/ordenes' },
    { label: `Compras · ${period.toLowerCase()}`, value: S0(purchases.total), badge: arrow(purchChange), note: `${toReceive} órdenes por recibir`, tone: 'amber', icon: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', to: '/compras/ordenes' },
    { label: 'Utilidad bruta', value: S0(profit), badge: (margin * 100).toFixed(1) + '%', note: 'margen sobre ventas', tone: 'blue', icon: 'M3 3v18h18M8 17v-5M13 17V8M18 17V5', to: '/reportes' },
    { label: 'Productos con stock crítico', value: String(critical.length), badge: critical.length ? '↓ Crítico' : 'OK', note: critical.length ? 'necesita atención' : 'todo sobre el mínimo', tone: critical.length ? 'red' : 'green', icon: 'M12 3l10 18H2zM12 10v4M12 17.5v.01', to: '/inventario/stock' },
  ];

  const secondary = [
    { label: 'Cuentas por cobrar', note: `${receivables.length} documentos · ${receivables.filter(r => r.estado === 'Vencida').length} vencidos`, value: S0(receivables.reduce((a, r) => a + Number(r.saldo), 0)), to: '/finanzas/cxc' },
    { label: 'Cuentas por pagar', note: `${payables.length} facturas · ${payables.filter(r => r.estado === 'Vence esta semana').length} vencen esta semana`, value: S0(payables.reduce((a, r) => a + Number(r.saldo), 0)), to: '/finanzas/cxp' },
    { label: 'Rotación de inventario', note: rot ? `${rot.days} días promedio en almacén` : 'sin datos suficientes', value: rot ? rot.times.toFixed(1) + '×' : '—', to: '/reportes' },
  ];

  const latest = d.orders
    .filter(o => o.kind === 'venta')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(o => ({ o, status: saleListStatus(d, o) }));
  const rows = latest.filter(r => filter === 'Todas' || r.status === filter).slice(0, 5);

  const all = alerts(d);
  const unread = all.filter(a => !d.alertsRead.includes(a.key)).length;
  const stockAlerts = all.filter(a => a.group === 'stock');
  const debtAlerts = all.filter(a => a.group === 'cxc');
  const userAlerts = all.filter(a => a.group === 'user');

  const resend = (email: string, name: string) => {
    mutate(dr => audit(dr, { action: 'Editar', module: 'Administración', ref: email, desc: `Invitación reenviada a ${name}` }));
    toast.flash(`Invitación reenviada a ${name}`);
  };

  return (
    <AppShell active="Dashboard" breadcrumb={[{ label: 'Inicio' }, { label: 'Dashboard' }]} searchPlaceholder="Buscar órdenes, clientes, productos, facturas…">
      <div className="page-head">
        <div>
          <h1 className="page__title">{greeting(now)}, {me.name.split(' ')[0]}</h1>
          <div className="page__subtitle">Resumen operativo · {MES[now.getMonth()][0].toUpperCase() + MES[now.getMonth()].slice(1)} {now.getFullYear()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="segmented" role="tablist" aria-label="Periodo">
            {PERIODS.map(p => (
              <button key={p} type="button" role="tab" aria-selected={p === period} className={p === period ? 'is-on' : ''} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          {can(d, 'Órdenes de venta', 'Crear') && (
            <button type="button" className="btn btn--primary" style={{ height: 30 }} onClick={() => navigate('/ventas/ordenes/nueva')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Nueva venta
            </button>
          )}
        </div>
      </div>

      <section className="dash-kpis">
        {kpis.map(k => (
          <Link key={k.label} to={k.to} className="dash-kpi">
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
          </Link>
        ))}
      </section>

      <section className="dash-secondary">
        {secondary.map(s => (
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
            {rows.map(({ o, status }) => {
              const t = new Date(o.createdAt);
              return (
                <div key={o.code} role="row" tabIndex={0} className="sales-row sales-row--body" onClick={() => navigate(`/ventas/orden/${o.code}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/ventas/orden/${o.code}`)}>
                  <span className="mono ellipsis" style={{ fontSize: 11.5, color: 'var(--text-2)', minWidth: 0 }}>{o.code}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{o.party.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>RUC {o.party.ruc}</div>
                  </div>
                  <span className="mono t-right" style={{ whiteSpace: 'nowrap' }}>{formatMoney(orderTotal(o))}</span>
                  <span><StatusChip label={status} tone={SALE_TONE[status]} /></span>
                  <div className="mono t-right" style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDayMonth(t)}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)' }}>{fmtTime(t)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && (
            <div className="table__empty" style={{ padding: '32px 16px' }}>
              {latest.length ? 'Sin ventas con este estado.' : <>Aún no hay ventas. <Link to="/ventas/ordenes/nueva">Registrar una venta</Link></>}
            </div>
          )}
          <div className="table__foot" style={{ alignItems: 'center' }}>
            <span>Mostrando {rows.length} de {latest.length.toLocaleString('en-US')} órdenes</span>
            <Link to="/ventas/ordenes" style={{ fontSize: 12 }}>Ir a órdenes de venta</Link>
          </div>
        </div>

        <div className="panel">
          <div className="panel__head" style={{ padding: '12px 16px' }}>
            <div className="panel__title">Alertas del sistema</div>
            {unread > 0 && <span className="count-badge">{unread}</span>}
            {unread > 0 && (
              <button type="button" className="link-btn" style={{ marginLeft: 'auto', height: 'auto', padding: 0 }} onClick={() => mutate(dr => { dr.alertsRead = alerts(dr).map(a => a.key); })}>
                Marcar como leídas
              </button>
            )}
          </div>

          {all.length === 0 && <div className="table__empty" style={{ padding: '32px 16px' }}>Sin alertas. Todo en orden.</div>}

          {stockAlerts.length > 0 && (
            <>
              <div className="alert-group" style={{ borderTop: 0, marginTop: 0, paddingTop: 10 }}>
                <span className="alert-group__dot" style={{ background: 'var(--red)' }} />Stock bajo mínimo · {stockAlerts.length}
              </div>
              {stockAlerts.slice(0, 3).map(s => (
                <div key={s.key} className={'alert-row' + (d.alertsRead.includes(s.key) ? ' is-read' : '')} onClick={() => navigate(s.to)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{s.title}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{s.sub}</div>
                  </div>
                  <div className="stockbar">
                    <span className="mono" style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--red)' }}>{s.qty}</span><span style={{ color: 'var(--faint)' }}> / {s.min}</span>
                    </span>
                    <div className="stockbar__track"><div style={{ width: Math.min(100, Math.floor(((s.qty ?? 0) / (s.min || 1)) * 100)) + '%' }} /></div>
                  </div>
                </div>
              ))}
              {stockAlerts.length > 3 && <Link className="alert-more" to="/inventario/stock">Ver {stockAlerts.length - 3} más</Link>}
            </>
          )}

          {debtAlerts.length > 0 && (
            <>
              <div className="alert-group" style={stockAlerts.length ? undefined : { borderTop: 0, marginTop: 0 }}>
                <span className="alert-group__dot" style={{ background: 'var(--amber)' }} />Facturas vencidas · {debtAlerts.length}
              </div>
              {debtAlerts.slice(0, 3).map(i => (
                <div key={i.key} className={'alert-row' + (d.alertsRead.includes(i.key) ? ' is-read' : '')} onClick={() => navigate(i.to)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{i.sub}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 12 }}>{i.value}</span>
                </div>
              ))}
              {debtAlerts.length > 3 && <Link className="alert-more" to="/finanzas/cxc">Ver {debtAlerts.length - 3} más</Link>}
            </>
          )}

          {userAlerts.length > 0 && (
            <>
              <div className="alert-group">
                <span className="alert-group__dot" style={{ background: 'var(--blue)' }} />Usuarios · {userAlerts.length}
              </div>
              {userAlerts.map(u => {
                const row = d.records.usuarios.find(x => u.key.startsWith(`user:${x.correo}:`));
                const initials = String(row?.nombre ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('');
                return (
                  <div key={u.key} className="alert-row alert-row--static" style={{ paddingBottom: 14 }}>
                    <div className="mini-avatar">{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{u.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--faint)' }}>{u.sub}</div>
                    </div>
                    {row?.estado === 'Sin confirmar' ? (
                      <button type="button" className="btn-resend" onClick={() => resend(String(row.correo), String(row.nombre))}>Reenviar</button>
                    ) : (
                      <button type="button" className="btn-resend" onClick={() => navigate(u.to)}>Revisar</button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>
      <Toast message={toast.message} />
    </AppShell>
  );
}
