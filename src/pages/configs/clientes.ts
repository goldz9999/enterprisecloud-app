import { payTermOptions } from '../../data/domain/orders';
import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const clientes: RecordsConfig = {
  active: 'Clientes',
  title: 'Clientes',
  subtitle: 'Registro maestro de clientes. Se usan al crear cotizaciones, órdenes de venta y comprobantes.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Clientes' }],
  newLabel: 'Nuevo cliente',
  crud: true, entity: 'Cliente', titleKey: 'razon', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo cliente', newKicker: 'Mantenimiento · Clientes', msgNew: 'Cliente creado', msgDel: 'Cliente eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod', 'razon', 'tdoc', 'ndoc', 'contacto', 'tel', 'correo', 'dir', 'cond', 'linea', 'vend', 'estado'],
  collection: 'clientes',
  code: { key: 'cod', prefix: 'CLI-', width: 6 },
  canDelete: (row, d) => {
    if (d.orders.some(o => o.kind === 'venta' && o.party.name === row.razon) || d.records.cxc.some(r => r.cliente === row.razon))
      return 'Este cliente tiene órdenes o comprobantes registrados. Márcalo como Inactivo para conservar el historial.';
  },
  columns: [{ k: 'cod', label: 'Código', w: '100px', mono: true, muted: true }, { k: 'razon', label: 'Razón social / nombre', w: 'minmax(0, 1.4fr)', sub: 'ndoc', bold: true }, { k: 'contacto', label: 'Contacto', w: 'minmax(0, 1fr)', sub: 'tel' }, { k: 'cond', label: 'Condición', w: '116px', muted: true }, { k: 'linea', label: 'Línea crédito', w: '112px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'tdoc', label: 'Tipo de documento', type: 'select', options: ['RUC', 'DNI', 'CE'] }, { k: 'ndoc', label: 'N.º de documento', required: true, placeholder: '11 dígitos para RUC' }, { k: 'razon', label: 'Razón social / nombre', required: true, wide: true }, { k: 'dir', label: 'Dirección fiscal', wide: true }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' }, { k: 'correo', label: 'Correo para comprobantes', wide: true }, { k: 'cond', label: 'Condición de pago', placeholder: 'Ej. Crédito 60 días', suggestions: payTermOptions }, { k: 'linea', label: 'Línea de crédito (S/)', type: 'number', fmt: 'money' }, { k: 'vend', label: 'Vendedor asignado', type: 'select', options: opts.masterUsers }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'Un cliente con órdenes o comprobantes registrados no se elimina: se marca como Inactivo para conservar el historial.',
};