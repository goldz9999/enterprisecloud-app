import type { RecordsConfig } from '../../features/records/types';
import { audit } from '../../data/domain/audit';
import { bankAccounts, pay, payableView } from '../../data/domain/finance';
import { syncOrderSettlement } from '../../data/domain/orders';
import type { DB, Row } from '../../data/types';
import { formatMoney as fmtM } from '../../lib/format';
import type { Field } from '../../features/records/types';

const payFields = (r: Row, d: DB): Field[] => [
  { k: 'mon', label: 'Monto pagado (S/)', type: 'number', required: true, value: Number(r.saldo).toFixed(2) },
  { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Cheque', 'Efectivo'] },
  { k: 'cta', label: 'Cuenta origen', type: 'select', options: () => [...bankAccounts(d), 'Caja'] },
  { k: 'op', label: 'N.º de operación' },
];
const registerPayment = (d: DB, r: Row, v: Record<string, string>) => {
  const amount = Number(v.mon);
  if (!(amount > 0)) return 'Ingresa un monto mayor que cero.';
  const p = { amount, medio: v.med, cuenta: v.cta === 'Caja' || v.med === 'Efectivo' ? '' : v.cta, op: v.op };
  pay(d, r, p);
  syncOrderSettlement(d, r, p);
};
const schedule = { label: 'Programar pago al vencimiento', toast: 'Pago programado', run: (d: DB, r: Row) => { r.programado = 'Sí'; audit(d, { action: 'Editar', module: 'Finanzas', ref: String(r.doc), desc: `Pago programado para el ${r.vence}` }); } };

export const cuentasPorPagar: RecordsConfig = {
  active: 'Cuentas por pagar',
  title: 'Cuentas por pagar',
  subtitle: 'Obligaciones con proveedores, generadas al registrar sus facturas. Se cierran al registrar el pago.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por pagar' }],
  collection: 'cxp',
  entity: 'Cuenta por pagar', titleKey: 'doc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por vencer': 'blue', 'Vence esta semana': 'amber', 'Vencida': 'red', 'Pagada': 'green' },
  keys: ['doc','emision','prov','ruc','vence','total','saldo','estado','dias'],
  view: payableView,
  kpis: rows => {
    const open = rows.filter(r => r.estado !== 'Pagada');
    const sum = (list: typeof rows) => list.reduce((a, r) => a + Number(r.saldo), 0);
    return [
      { label: 'Saldo por pagar', value: fmtM(sum(open)), note: open.length + ' documentos abiertos' },
      { label: 'Vence esta semana', value: fmtM(sum(open.filter(r => r.estado === 'Vence esta semana'))), note: 'programar pagos', tone: 'amber' },
      { label: 'Vencido', value: fmtM(sum(open.filter(r => r.estado === 'Vencida'))), note: 'pagar a la brevedad', tone: 'red' },
    ];
  },
  columns: [{ k: 'doc', label: 'Factura', w: '120px', mono: true, sub: 'emision' }, { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'vence', label: 'Vence', w: '120px', sub: 'dias' }, { k: 'saldo', label: 'Saldo', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '136px', chip: true }],
  fields: [{ k: 'doc', label: 'Factura del proveedor', mono: true }, { k: 'emision', label: 'Emisión' }, { k: 'prov', label: 'Proveedor', wide: true }, { k: 'vence', label: 'Vencimiento' }, { k: 'dias', label: 'Situación' }, { k: 'orden', label: 'Orden de compra', mono: true }, { k: 'total', label: 'Importe original', fmt: 'money' }, { k: 'saldo', label: 'Saldo pendiente', fmt: 'money' }],
  note: 'Al pagar se registra el egreso en Bancos (o en Caja si es en efectivo).',
  actions: { '*': [{ label: 'Registrar pago', primary: true, toast: 'Pago registrado', fields: payFields, run: registerPayment }, schedule], 'Pagada': [] },
  rows: [
    ['F002-08812','03 oct 2026','Aceros del Sur S.A.C.','20433221109','17 nov 2026',14393.64,14393.64,'Por vencer','vence en 46 días'],
    ['F001-22871','25 sep 2026','Cementos Pacasmayo Dist. S.A.','20419387658','05 oct 2026',6240,6240,'Vence esta semana','vence en 3 días'],
    ['E001-00918','22 sep 2026','EPP Seguridad Total S.A.C.','20566778899','06 oct 2026',2140.5,2140.5,'Vence esta semana','vence en 4 días'],
    ['F003-00412','10 sep 2026','Transportes Rápido Sur S.A.C.','20599911122','04 oct 2026',1086,1086,'Vence esta semana','vence en 2 días'],
    ['F001-04410','01 sep 2026','Pinturas Andinas S.A.','20288877766','01 oct 2026',6320,1000,'Vencida','1 día vencida'],
    ['F001-03392','28 ago 2026','Cables y Conductores Perú S.A.','20511199988','27 sep 2026',4880,0,'Pagada','pagada 26 sep'],
  ],
};
