import type { RecordsConfig } from '../../features/records/types';

export const bancos: RecordsConfig = {
  active: 'Bancos',
  title: 'Bancos',
  subtitle: 'Movimientos de las cuentas bancarias de la empresa. Concilia cada movimiento con su cobro, pago o comprobante.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Bancos' }],
  entity: 'Movimiento bancario', titleKey: 'desc', subKey: 'cuenta', statusKey: 'estado',
  statuses: { 'Conciliado': 'green', 'Pendiente': 'amber' },
  keys: ['fecha','desc','cuenta','ref','monto','estado'],
  kpis: [{ label: 'BCP · 191-2345678', value: 'S/ 148,320.40', note: 'cuenta corriente soles' }, { label: 'Interbank · 200-3011', value: 'S/ 62,115.00', note: 'cuenta corriente soles' }, { label: 'BBVA · 0011-0245', value: 'S/ 39,870.25', note: 'cuenta recaudadora' }],
  columns: [{ k: 'fecha', label: 'Fecha', w: '96px', mono: true, muted: true }, { k: 'desc', label: 'Descripción', w: 'minmax(0, 1fr)', sub: 'cuenta' }, { k: 'ref', label: 'Referencia', w: '120px', mono: true, muted: true }, { k: 'monto', label: 'Monto', w: '124px', fmt: 'signed', align: 'right' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [{ k: 'fecha', label: 'Fecha' }, { k: 'cuenta', label: 'Cuenta' }, { k: 'desc', label: 'Descripción', wide: true }, { k: 'ref', label: 'Referencia', mono: true }, { k: 'monto', label: 'Monto', fmt: 'signed' }],
  notes: { 'Pendiente': 'Este movimiento aún no está vinculado a un cobro, pago o comprobante del ERP.' },
  actions: { 'Pendiente': [{ label: 'Conciliar con documento', to: 'Conciliado', primary: true, toast: 'Movimiento conciliado' }] },
  rows: [
    ['02 oct 2026','Abono · Distribuidora Andina S.A.C.','BCP · 191-2345678','OP 00481920',12480,'Conciliado'],
    ['02 oct 2026','Comisión de mantenimiento de cuenta','BCP · 191-2345678','CM-1002',-18,'Pendiente'],
    ['01 oct 2026','Transferencia a Plásticos Lima S.R.L.','Interbank · 200-3011','OP 00912201',-3894,'Conciliado'],
    ['30 sep 2026','Abono · Minera Los Andes S.A.','BBVA · 0011-0245','OP 77120933',21300,'Pendiente'],
    ['29 sep 2026','Pago de planilla setiembre','BCP · 191-2345678','PLA-2026-09',-28450,'Conciliado'],
    ['26 sep 2026','Transferencia a Cables y Conductores Perú','Interbank · 200-3011','OP 00911870',-4880,'Conciliado'],
  ],
};
