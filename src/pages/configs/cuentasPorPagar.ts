import type { RecordsConfig } from '../../features/records/types';
import { payRemote } from '../../data/domain/finance';
import { formatMoney as fmtM } from '../../lib/format';

/** Cuenta bancaria registrada del proveedor (Mantenimiento › Proveedores), para saber a dónde transferir. */
const supplierAccount = (d: import('../../data/types').DB, name: unknown) =>
  String(d.records.proveedores.find(p => p.razon === name)?.cuenta ?? '').trim();

export const cuentasPorPagar: RecordsConfig = {
  active: 'Cuentas por pagar',
  title: 'Cuentas por pagar',
  subtitle: 'Obligaciones con proveedores, generadas al registrar sus facturas. Se cierran al registrar el pago.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por pagar' }],
  collection: 'cxp',
  entity: 'Cuenta por pagar', titleKey: 'doc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por vencer': 'blue', 'Vence esta semana': 'amber', 'Vencida': 'red', 'Pagada': 'green' },
  keys: ['doc', 'emision', 'prov', 'ruc', 'vence', 'total', 'saldo', 'estado', 'dias', 'orden', 'uuid'],
  view: (row, d) => ({ ...row, cuenta: supplierAccount(d, row.prov) || 'Sin cuenta registrada' }),
  kpis: rows => {
    const open = rows.filter(r => r.estado !== 'Pagada');
    const sum = (list: typeof rows) => list.reduce((a, r) => a + Number(r.saldo), 0);
    return [
      { label: 'Saldo por pagar', value: fmtM(sum(open)), note: open.length + ' documentos abiertos' },
      { label: 'Vence esta semana', value: fmtM(sum(open.filter(r => r.estado === 'Vence esta semana'))), note: 'programar pagos', tone: 'amber' },
      { label: 'Vencido', value: fmtM(sum(open.filter(r => r.estado === 'Vencida'))), note: 'pagar a la brevedad', tone: 'red' },
    ];
  },
  columns: [
    { k: 'doc', label: 'Factura', w: '120px', mono: true, sub: 'emision' },
    { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'ruc' },
    { k: 'vence', label: 'Vence', w: '120px', sub: 'dias' },
    { k: 'saldo', label: 'Saldo', w: '116px', fmt: 'money', align: 'right' },
    { k: 'estado', label: 'Estado', w: '136px', chip: true },
  ],
  fields: [
    { k: 'doc', label: 'Factura del proveedor', mono: true },
    { k: 'emision', label: 'Emisión' },
    { k: 'prov', label: 'Proveedor', wide: true },
    { k: 'cuenta', label: 'Cuenta bancaria del proveedor', wide: true },
    { k: 'vence', label: 'Vencimiento' },
    { k: 'dias', label: 'Situación' },
    { k: 'orden', label: 'Orden de compra', mono: true },
    { k: 'total', label: 'Importe original', fmt: 'money' },
    { k: 'saldo', label: 'Saldo pendiente', fmt: 'money' },
  ],
  note: 'Al pagar se registra el egreso en Bancos (o en Caja si es en efectivo).',
  actions: {
    '*': [{
      label: 'Registrar pago', primary: true, toast: 'Pago registrado',
      fields: (r, d) => [
        { k: 'cuenta', label: 'Cuenta del proveedor (donde se le paga)', readOnly: true, wide: true, value: supplierAccount(d, r.prov) || 'Sin cuenta registrada: agrégala en Proveedores' },
        { k: 'monto', label: 'Monto a pagar (S/)', type: 'number', required: true },
        { k: 'canal', label: 'Canal', type: 'select', options: ['Bancos', 'Caja'] },
        { k: 'ref', label: 'Referencia', placeholder: 'Nº operación / voucher' },
      ],
      run: (_d, r, v) => {
        const amount = Number(v.monto) || Number(r.saldo);
        if (!(amount > 0)) return 'Indica el monto a pagar.';
        void payRemote(String(r.uuid || r.doc), amount, String(v.canal || 'Bancos'), v.ref ? String(v.ref) : undefined);
      },
    }],
    'Pagada': [],
  },
};
