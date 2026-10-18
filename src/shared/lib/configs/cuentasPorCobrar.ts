import type { RecordsConfig } from '@/shared/components/records/types';
import { collectRemote } from '@/data/domain/finance';
import { formatMoney as fmtM } from '@/shared/lib/format';

export const cuentasPorCobrar: RecordsConfig = {
  active: 'Cuentas por cobrar',
  title: 'Cuentas por cobrar',
  subtitle: 'Saldos de clientes por facturas emitidas. Se cierran al registrar el cobro en Caja o Bancos.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por cobrar' }],
  collection: 'cxc',
  entity: 'Cuenta por cobrar', titleKey: 'doc', subKey: 'cliente', statusKey: 'estado',
  statuses: { 'Por vencer': 'blue', 'Vence esta semana': 'amber', 'Vencida': 'red', 'Cobrada': 'green' },
  keys: ['doc', 'emision', 'cliente', 'ruc', 'vence', 'total', 'saldo', 'estado', 'dias', 'orden', 'uuid'],
  kpis: rows => {
    const open = rows.filter(r => r.estado !== 'Cobrada');
    const sum = (list: typeof rows) => list.reduce((a, r) => a + Number(r.saldo), 0);
    return [
      { label: 'Saldo por cobrar', value: fmtM(sum(open)), note: open.length + ' documentos abiertos' },
      { label: 'Vence esta semana', value: fmtM(sum(open.filter(r => r.estado === 'Vence esta semana'))), note: 'priorizar cobro', tone: 'amber' },
      { label: 'Vencido', value: fmtM(sum(open.filter(r => r.estado === 'Vencida'))), note: 'gestionar cobranza', tone: 'red' },
    ];
  },
  columns: [
    { k: 'doc', label: 'Comprobante', w: '120px', mono: true, sub: 'emision' },
    { k: 'cliente', label: 'Cliente', w: 'minmax(0, 1fr)', sub: 'ruc' },
    { k: 'vence', label: 'Vence', w: '120px', sub: 'dias' },
    { k: 'saldo', label: 'Saldo', w: '116px', fmt: 'money', align: 'right' },
    { k: 'estado', label: 'Estado', w: '136px', chip: true },
  ],
  fields: [
    { k: 'doc', label: 'Comprobante', mono: true },
    { k: 'emision', label: 'Emisión' },
    { k: 'cliente', label: 'Cliente', wide: true },
    { k: 'vence', label: 'Vencimiento' },
    { k: 'dias', label: 'Situación' },
    { k: 'orden', label: 'Orden de venta', mono: true },
    { k: 'total', label: 'Importe original', fmt: 'money' },
    { k: 'saldo', label: 'Saldo pendiente', fmt: 'money' },
  ],
  note: 'Al cobrar se registra el ingreso en Caja (efectivo) o Bancos (transferencia).',
  actions: {
    '*': [{
      label: 'Registrar cobro', primary: true, toast: 'Cobro registrado',
      fields: [
        { k: 'monto', label: 'Monto a cobrar (S/)', type: 'number', required: true },
        { k: 'canal', label: 'Canal', type: 'select', options: ['Caja', 'Bancos'] },
        { k: 'ref', label: 'Referencia', placeholder: 'Nº operación / voucher' },
      ],
      run: (_d, r, v) => {
        const amount = Number(v.monto) || Number(r.saldo);
        if (!(amount > 0)) return 'Indica el monto a cobrar.';
        void collectRemote(String(r.uuid || r.doc), amount, String(v.canal || 'Caja'), v.ref ? String(v.ref) : undefined);
      },
    }],
    'Cobrada': [],
  },
};
