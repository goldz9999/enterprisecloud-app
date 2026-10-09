import { payTermOptions } from '../../data/domain/orders';
import { suggest } from './shared';
import type { RecordsConfig } from '../../features/records/types';

/** Pestañas de la sección Proveedores (cada una es una ruta). */
export const proveedorTabs = [
  { label: 'Proveedores', to: '/mantenimiento/proveedores' },
  { label: 'Precios por proveedor', to: '/mantenimiento/proveedores/precios' },
];

export const proveedores: RecordsConfig = {
  active: 'Proveedores',
  tabs: proveedorTabs,
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
  fields: [{ k: 'ruc', label: 'RUC', required: true, placeholder: '11 dígitos' }, { k: 'rubro', label: 'Rubro', placeholder: 'Ej. Cemento, Transporte', suggestions: suggest('proveedores', 'rubro', ['Transporte']) }, { k: 'razon', label: 'Razón social', required: true, wide: true }, { k: 'dir', label: 'Dirección', wide: true }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' }, { k: 'correo', label: 'Correo', wide: true }, { k: 'cond', label: 'Condición de pago', placeholder: 'Ej. Crédito 60 días', suggestions: payTermOptions }, { k: 'cuenta', label: 'Cuenta bancaria', placeholder: 'Banco y número' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'La cuenta bancaria es la del proveedor (a dónde se le paga): se muestra al registrar pagos en Cuentas por pagar y en la orden de compra. Tus propias cuentas se definen en Configuración › Tesorería. Su cambio queda registrado en auditoría. Lo que vende cada proveedor y a qué precio está en la pestaña "Precios por proveedor".',
};