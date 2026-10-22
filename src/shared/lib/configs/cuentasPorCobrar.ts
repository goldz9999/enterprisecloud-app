import type { RecordsConfig } from '@/shared/components/records/types';
import { bankAccountLabels, collectRemote } from '@/data/domain/finance';
import { formatMoney as fmtM } from '@/shared/lib/format';

export const cuentasPorCobrar: RecordsConfig = {
  active: 'Cuentas por cobrar',
  title: 'Cuentas por cobrar',
  subtitle: 'Saldos de clientes por facturas emitidas. Se cierran al registrar el cobro en Caja o Bancos.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Cuentas por cobrar' }],
  collection: 'cxc',
  centered: true,
  // Al hacer clic en una cuenta abierta ya aparece el formulario de cobro (sin pulsar «Registrar cobro» dos veces).
  openWithAction: true,
  // «Cobrar» en Órdenes de venta llega como /finanzas/cxc?cobrar=OV-…: abre esa cuenta con el cobro listo.
  autoOpen: { param: 'cobrar', key: 'orden' },
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
  note: 'Al cobrar, el efectivo entra a Caja y la transferencia a la cuenta bancaria elegida.',
  actions: {
    '*': [{
      label: 'Registrar cobro', primary: true, toast: 'Cobro registrado',
      fields: [
        { k: 'monto', label: 'Monto a cobrar (S/)', type: 'number', required: true, value: (_d, r) => String(r?.saldo ?? '') },
        { k: 'canal', label: 'Forma de pago', type: 'select', options: ['Efectivo', 'Transferencia bancaria'] },
        // Solo con transferencia: a qué cuenta de la empresa depositó el cliente y el número de operación.
        { k: 'cuenta', label: 'Cuenta de destino', type: 'select', options: () => bankAccountLabels(), required: true, showIf: f => f.canal === 'Transferencia bancaria' },
        { k: 'ref', label: 'N.º de operación', placeholder: 'Ej. 00123456', required: true, showIf: f => f.canal === 'Transferencia bancaria' },
      ],
      run: (_d, r, v) => {
        const amount = Number(v.monto) || Number(r.saldo);
        if (!(amount > 0)) return 'Indica el monto a cobrar.';
        const bank = v.canal === 'Transferencia bancaria';
        void collectRemote(String(r.uuid || r.doc), amount, bank ? 'Bancos' : 'Caja', bank && v.ref ? String(v.ref) : undefined, bank ? String(v.cuenta) : undefined);
      },
    }],
    'Cobrada': [],
  },
};