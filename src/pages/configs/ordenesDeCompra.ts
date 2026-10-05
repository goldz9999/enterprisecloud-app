import type { RecordsConfig } from '../../features/records/types';
import { orderTotal, purchaseListStatus } from '../../data/domain/orders';
import type { DB, Row } from '../../data/types';
import { displayDate, fmtDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';

const purchaseRows = (d: DB): Row[] =>
  d.orders
    .filter(o => o.kind === 'compra')
    .map((o, i) => ({
      _id: i + 1, oc: o.code, fecha: fmtDate(new Date(o.createdAt)), prov: o.party.name, ruc: o.party.ruc,
      entrega: o.forms[1]?.ent ? displayDate(o.forms[1].ent) : '—', total: Math.round(orderTotal(o) * 100) / 100,
      estado: purchaseListStatus(o), sol: o.origin ?? 'Compra directa', comprador: o.seller, alm: o.warehouse, at: o.createdAt,
    }));
const open = (r: Row) => `/compras/orden/${r.oc}`;

export const ordenesDeCompra: RecordsConfig = {
  active: 'Órdenes de compra',
  title: 'Órdenes de compra',
  subtitle: 'Órdenes emitidas a proveedores a partir de solicitudes aprobadas. Abre una orden para avanzar su flujo.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Compras' }, { label: 'Órdenes de compra' }],
  newLabel: 'Nueva orden de compra',
  newTo: '/compras/ordenes/nueva',
  source: purchaseRows,
  entity: 'Orden de compra', titleKey: 'oc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por aprobar': 'amber', 'Aprobada': 'blue', 'Recibida': 'blue', 'Facturada': 'amber', 'Pagada': 'green', 'Anulada': 'muted' },
  keys: ['oc','fecha','prov','ruc','entrega','total','estado','sol','comprador'],
  kpis: rows => {
    const now = new Date();
    const month = rows.filter(r => { const t = new Date(String(r.at)); return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear() && r.estado !== 'Anulada'; });
    return [
      { label: 'Compras del mes', value: formatMoney(month.reduce((a, r) => a + Number(r.total), 0)), note: `${month.length} órdenes emitidas` },
      { label: 'Por recibir', value: String(rows.filter(r => r.estado === 'Aprobada').length), note: 'aprobadas, sin recepción', tone: 'amber' },
      { label: 'Por aprobar', value: String(rows.filter(r => r.estado === 'Por aprobar').length), note: 'requieren aprobación', tone: 'amber' },
    ];
  },
  columns: [{ k: 'oc', label: 'Orden', w: '120px', mono: true, sub: 'fecha' }, { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'entrega', label: 'Entrega', w: '96px', muted: true, mono: true }, { k: 'total', label: 'Total', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [{ k: 'oc', label: 'Orden', mono: true }, { k: 'fecha', label: 'Fecha' }, { k: 'prov', label: 'Proveedor', wide: true }, { k: 'ruc', label: 'RUC', mono: true }, { k: 'sol', label: 'Solicitud de origen', mono: true }, { k: 'comprador', label: 'Comprador' }, { k: 'entrega', label: 'Entrega pactada' }, { k: 'alm', label: 'Almacén destino' }, { k: 'total', label: 'Total (inc. IGV)', fmt: 'money' }],
  actions: { 'Por aprobar': [{ label: 'Abrir y aprobar →', href: open, primary: true }], '*': [{ label: 'Abrir orden →', href: open, primary: true }] },
};
