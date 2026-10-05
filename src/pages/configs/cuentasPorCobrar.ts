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
  keys: ['doc','emision','cliente','ruc','vence','total','saldo','estado','dias'],
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
  rows: [
    ['F001-00249','03 oct 2026','Constructora Pacífico E.I.R.L.','20601122334','02 nov 2026',8920.5,8920.5,'Por vencer','vence en 31 días'],
    ['F001-00244','29 sep 2026','Agroexportadora Ica S.A.C.','20577889900','29 oct 2026',5320,5320,'Por vencer','vence en 27 días'],
    ['F001-00234','26 sep 2026','Farmacias Salud Total S.A.C.','20488776651','27 sep 2026',3145.9,3145.9,'Vencida','5 días vencida'],
    ['F001-00219','20 sep 2026','Comercial Norte Trujillo S.A.','20399887766','20 sep 2026',7820,7820,'Vencida','12 días vencida'],
    ['F001-00187','02 ago 2026','Inversiones Cusco Plaza S.A.C.','20522334455','01 sep 2026',4930,2930,'Cobro parcial','31 días vencida'],
    ['F001-00152','15 jul 2026','Ferretería El Constructor E.I.R.L.','20611223344','14 ago 2026',1450,1450,'Vencida','49 días vencida'],
    ['F001-00248','02 oct 2026','Distribuidora Andina S.A.C.','20512345671','02 oct 2026',12480,0,'Cobrada','cobrada 02 oct'],
  ],
};
