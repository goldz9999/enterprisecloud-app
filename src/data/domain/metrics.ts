import { addDays } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import type { DB, Order } from '../types';
import { payableView, receivableView } from './finance';
import { orderTotal } from './orders';

export type Period = 'Hoy' | 'Semana' | 'Mes' | 'Año';

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** [start, end) of the current period and of the one before it. */
export function periodRange(p: Period, now = new Date()): { cur: [Date, Date]; prev: [Date, Date] } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case 'Hoy':
      return { cur: [day, addDays(day, 1)], prev: [addDays(day, -1), day] };
    case 'Semana': {
      const start = addDays(day, -((day.getDay() + 6) % 7)); // Monday
      return { cur: [start, addDays(start, 7)], prev: [addDays(start, -7), start] };
    }
    case 'Mes': {
      const start = new Date(day.getFullYear(), day.getMonth(), 1);
      return { cur: [start, new Date(day.getFullYear(), day.getMonth() + 1, 1)], prev: [new Date(day.getFullYear(), day.getMonth() - 1, 1), start] };
    }
    case 'Año': {
      const start = new Date(day.getFullYear(), 0, 1);
      return { cur: [start, new Date(day.getFullYear() + 1, 0, 1)], prev: [new Date(day.getFullYear() - 1, 0, 1), start] };
    }
  }
}

const inRange = (iso: string, [a, b]: [Date, Date]) => {
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t < b.getTime();
};

export const liveSales = (d: DB) => d.orders.filter(o => o.kind === 'venta' && !o.cancelled);
export const livePurchases = (d: DB) => d.orders.filter(o => o.kind === 'compra' && !o.cancelled);

/** Months fully covered by [a, b), as YYYY-MM keys. */
function monthsIn([a, b]: [Date, Date]): string[] {
  const out: string[] = [];
  for (let m = new Date(a.getFullYear(), a.getMonth(), 1); m < b; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    if (m >= a && end <= b) out.push(monthKey(m));
  }
  return out;
}

/** Sales total (with IGV) and order count in a range: live orders plus pre-recorded monthly history. */
export function salesIn(d: DB, range: [Date, Date]): { total: number; orders: number; list: Order[] } {
  const list = liveSales(d).filter(o => inRange(o.createdAt, range));
  let total = list.reduce((a, o) => a + orderTotal(o), 0);
  let orders = list.length;
  for (const k of monthsIn(range)) {
    total += d.history.salesByMonth[k]?.total ?? 0;
    orders += d.history.salesByMonth[k]?.orders ?? 0;
  }
  return { total, orders, list };
}

export function purchasesIn(d: DB, range: [Date, Date]) {
  const list = livePurchases(d).filter(o => inRange(o.createdAt, range));
  return { total: list.reduce((a, o) => a + orderTotal(o), 0), list };
}

/** Gross margin of the recorded sales (price vs. average cost), 0–1. */
export function grossMargin(d: DB, orders = liveSales(d)): number {
  let sub = 0;
  let cost = 0;
  for (const o of orders)
    for (const l of o.lines) {
      sub += l.qty * l.price;
      cost += l.qty * Number(d.records.productos.find(p => p.sku === l.sku)?.costo ?? l.price);
    }
  return sub ? (sub - cost) / sub : 0;
}

export function inventoryValue(d: DB): number {
  return d.records.stock.reduce((a, s) => a + Number(s.stock) * Number(d.records.productos.find(p => p.sku === s.sku)?.costo ?? 0), 0);
}

/** Annual inventory turnover based on the last 12 months of sales at cost. */
export function turnover(d: DB): { times: number; days: number } | null {
  const now = new Date();
  const year = salesIn(d, [new Date(now.getFullYear() - 1, now.getMonth() + 1, 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)]);
  const inv = inventoryValue(d);
  if (!inv || !year.total) return null;
  const cogs = (year.total / 1.18) * (1 - grossMargin(d));
  const times = cogs / inv;
  return { times, days: Math.round(365 / times) };
}

export const openReceivables = (d: DB) => d.records.cxc.map(receivableView).filter(r => r.estado !== 'Cobrada');
export const openPayables = (d: DB) => d.records.cxp.map(payableView).filter(r => r.estado !== 'Pagada');

export const criticalStock = (d: DB) =>
  d.records.stock.filter(s => s.estado === 'Bajo mínimo' || s.estado === 'Sin stock').sort((a, b) => Number(a.stock) / (Number(a.min) || 1) - Number(b.stock) / (Number(b.min) || 1));

export interface Alert {
  key: string;
  group: 'stock' | 'cxc' | 'cxp' | 'user';
  title: string;
  sub: string;
  value: string;
  to: string;
  /** For stock alerts: quantity vs minimum. */
  qty?: number;
  min?: number;
}

/** System alerts shown in the bell and on the Dashboard. */
export function alerts(d: DB): Alert[] {
  const out: Alert[] = [];
  if (d.settings.alert !== false)
    for (const s of criticalStock(d))
      out.push({ key: `stock:${s.sku}:${s.alm}:${s.estado}`, group: 'stock', title: String(s.prod), sub: `${s.sku} · ${s.alm}`, value: `${s.stock} / ${s.min}`, to: `/inventario/stock?q=${s.sku}`, qty: Number(s.stock), min: Number(s.min) });
  for (const r of openReceivables(d).filter(r => r.estado === 'Vencida'))
    out.push({ key: `cxc:${r.doc}`, group: 'cxc', title: String(r.cliente), sub: `${r.doc} · ${r.dias}`, value: formatMoney(Number(r.saldo)), to: `/finanzas/cxc?q=${r.doc}` });
  for (const r of openPayables(d).filter(r => r.estado === 'Vencida' || r.estado === 'Vence esta semana'))
    out.push({ key: `cxp:${r.doc}:${r.estado}`, group: 'cxp', title: String(r.prov), sub: `${r.doc} · ${r.dias}`, value: formatMoney(Number(r.saldo)), to: `/finanzas/cxp?q=${r.doc}` });
  for (const u of d.records.usuarios.filter(u => u.estado === 'Sin confirmar' || u.estado === 'Bloqueado'))
    out.push({ key: `user:${u.correo}:${u.estado}`, group: 'user', title: `${u.nombre} · ${String(u.estado).toLowerCase()}`, sub: `Rol: ${u.rol}`, value: '', to: `/admin/usuarios?q=${u.correo}` });
  return out;
}

export const unreadAlerts = (d: DB) => alerts(d).filter(a => !d.alertsRead.includes(a.key));

