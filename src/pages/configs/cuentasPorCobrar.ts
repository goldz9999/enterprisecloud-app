import type { RecordsConfig } from '../../features/records/types';
import { audit } from '../../data/domain/audit';
import { bankAccounts, collect, receivableView } from '../../data/domain/finance';
import { syncOrderSettlement } from '../../data/domain/orders';
import type { DB, Row } from '../../data/types';
import { formatMoney as fmtM } from '../../lib/format';
import type { Field } from '../../features/records/types';

const payFields = (r: Row, d: DB): Field[] => [
  { k: 'mon', label: 'Monto cobrado (S/)', type: 'number', required: true, value: Number(r.saldo).toFixed(2) },
  { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Depósito en cuenta', 'Cheque', 'Efectivo'] },
  { k: 'cta', label: 'Cuenta destino', type: 'select', options: () => [...bankAccounts(d), 'Caja'] },
  { k: 'op', label: 'N.º de operación' },
];
const registerCollection = (d: DB, r: Row, v: Record<string, string>) => {
  const amount = Number(v.mon);
  if (!(amount > 0)) return 'Ingresa un monto mayor que cero.';
  const p = { amount, medio: v.med, cuenta: v.cta === 'Caja' || v.med === 'Efectivo' ? '' : v.cta, op: v.op };
  collect(d, r, p);
  syncOrderSettlement(d, r, p);
};
const reminder = { label: 'Enviar recordatorio al cliente', toast: 'Recordatorio registrado', run: (d: DB, r: Row) => { audit(d, { action: 'Editar', module: 'Finanzas', ref: String(r.doc), desc: `Recordatorio de pago enviado a ${r.cliente}` }); } };

export const cuentasPorCobrar: RecordsConfig = {
  active: 'Cuentas por cobrar',
  title: 'Cuentas por cobrar',
  subtitle: 'Saldos pendientes de clientes, generados al emitir comprobantes a crédito. Se cierran al registrar el cobro.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por cobrar' }],
  collection: 'cxc',
  entity: 'Cuenta por cobrar', titleKey: 'doc', subKey: 'cliente', statusKey: 'estado',
  statuses: { 'Por vencer': 'blue', 'Vencida': 'red', 'Cobro parcial': 'amber', 'Cobrada': 'green' },
  keys: ['doc', 'emision', 'cliente', 'ruc', 'vence', 'total', 'saldo', 'estado', 'dias'],
  view: receivableView,
  kpis: rows => {
    const open = rows.filter(r => r.estado !== 'Cobrada');
    const saldo = open.reduce((a, r) => a + Number(r.saldo), 0);
    const vencido = open.filter(r => r.estado === 'Vencida').reduce((a, r) => a + Number(r.saldo), 0);
    const clients = new Set(open.map(r => r.cliente)).size;
    return [
      { label: 'Saldo por cobrar', value: fmtM(saldo), note: open.length + ' documentos abiertos' },
      { label: 'Vencido', value: fmtM(vencido), note: Math.round((vencido / (saldo || 1)) * 100) + '% del saldo', tone: 'red' },
      { label: 'Clientes con deuda', value: String(clients), note: 'con saldo pendiente', tone: 'amber' },
    ];
  },
  columns: [{ k: 'doc', label: 'Documento', w: '120px', mono: true, sub: 'emision' }, { k: 'cliente', label: 'Cliente', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'vence', label: 'Vence', w: '120px', sub: 'dias' }, { k: 'saldo', label: 'Saldo', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '120px', chip: true }],
  fields: [{ k: 'doc', label: 'Comprobante', mono: true }, { k: 'emision', label: 'Emisión' }, { k: 'cliente', label: 'Cliente', wide: true }, { k: 'vence', label: 'Vencimiento' }, { k: 'dias', label: 'Situación' }, { k: 'orden', label: 'Orden de venta', mono: true }, { k: 'total', label: 'Importe original', fmt: 'money' }, { k: 'saldo', label: 'Saldo pendiente', fmt: 'money' }],
  note: 'Al cobrar se registra el ingreso en Bancos (o en Caja si es en efectivo). Si cobras menos del saldo, queda como cobro parcial.',
  actions: {
    'Por vencer': [{ label: 'Registrar cobro', primary: true, toast: 'Cobro registrado', fields: payFields, run: registerCollection }],
    'Vencida': [{ label: 'Registrar cobro', primary: true, toast: 'Cobro registrado', fields: payFields, run: registerCollection }, reminder],
    'Cobro parcial': [{ label: 'Registrar saldo restante', primary: true, toast: 'Cobro registrado', fields: payFields, run: registerCollection }, reminder],
  },
};