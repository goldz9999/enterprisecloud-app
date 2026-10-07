import type { RecordsConfig } from '../../features/records/types';

export const proveedores: RecordsConfig = {
  active: 'Proveedores',
  title: 'Proveedores',
  subtitle: 'Registro maestro de proveedores. Se usan al crear órdenes de compra, recepciones y cuentas por pagar.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Proveedores' }],
  newLabel: 'Nuevo proveedor',
  crud: true, entity: 'Proveedor', titleKey: 'razon', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo proveedor', newKicker: 'Mantenimiento · Proveedores', msgNew: 'Proveedor creado', msgDel: 'Proveedor eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod', 'razon', 'ruc', 'contacto', 'tel', 'correo', 'dir', 'rubro', 'cond', 'cuenta', 'estado'],
  collection: 'proveedores',
  code: { key: 'cod', prefix: 'PRV-', width: 6 },
  canDelete: (row, d) => {
    if (d.orders.some(o => o.kind === 'compra' && o.party.name === row.razon) || d.records.cxp.some(r => r.prov === row.razon))
      return 'Este proveedor tiene órdenes o facturas registradas. Márcalo como Inactivo para conservar el historial.';
  },
  columns: [{ k: 'cod', label: 'Código', w: '100px', mono: true, muted: true }, { k: 'razon', label: 'Razón social', w: 'minmax(0, 1.4fr)', sub: 'ruc', bold: true }, { k: 'contacto', label: 'Contacto', w: 'minmax(0, 1fr)', sub: 'tel' }, { k: 'rubro', label: 'Rubro', w: '112px', muted: true }, { k: 'cond', label: 'Condición', w: '116px', muted: true }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'ruc', label: 'RUC', required: true, placeholder: '11 dígitos' }, { k: 'rubro', label: 'Rubro', type: 'select', options: ['Acero y fierro', 'Cemento', 'Tubería PVC', 'EPP', 'Acabados', 'Eléctricos', 'Transporte'] }, { k: 'razon', label: 'Razón social', required: true, wide: true }, { k: 'dir', label: 'Dirección', wide: true }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' }, { k: 'correo', label: 'Correo', wide: true }, { k: 'cond', label: 'Condición de pago', type: 'select', options: ['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días'] }, { k: 'cuenta', label: 'Cuenta bancaria', placeholder: 'Banco y número' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'La cuenta bancaria se usa para los pagos desde Cuentas por pagar. Su cambio queda registrado en auditoría.',
};