import { opts } from './shared';
import { proveedorTabs } from './proveedores';
import type { RecordsConfig } from '../../features/records/types';

export const preciosProveedor: RecordsConfig = {
  // Es una pestaña de Proveedores: mismo menú y mismos permisos.
  active: 'Proveedores',
  tabs: proveedorTabs,
  title: 'Proveedores · Precios',
  subtitle: 'Qué producto vende cada proveedor y a qué precio (sin IGV). Al crear una compra, el costo de cada línea se toma de aquí según el proveedor elegido.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Proveedores', to: '/mantenimiento/proveedores' }, { label: 'Precios' }],
  newLabel: 'Nuevo precio',
  crud: true, entity: 'Precio de proveedor', titleKey: 'prod', subKey: 'prov', statusKey: 'estado', newTitle: 'Nuevo precio de proveedor', newKicker: 'Mantenimiento · Precios de proveedor', msgNew: 'Precio registrado', msgDel: 'Precio dado de baja',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['prov', 'prod', 'sku', 'unidad', 'costo', 'skuProv', 'notas', 'estado'],
  collection: 'preciosProv',
  onCreate: (d, row) => {
    if (d.records.preciosProv.some(p => p.prov === row.prov && p.prod === row.prod)) return `${row.prov} ya tiene un precio para ${row.prod}. Edítalo en lugar de crear otro.`;
  },
  columns: [
    { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', bold: true },
    { k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'sku' },
    { k: 'skuProv', label: 'Cód. del proveedor', w: '130px', mono: true, muted: true },
    { k: 'costo', label: 'Precio de compra', w: '120px', fmt: 'money', align: 'right' },
    { k: 'estado', label: 'Estado', w: '96px', chip: true },
  ],
  fields: [
    { k: 'prov', label: 'Proveedor', type: 'select', options: opts.suppliers, required: true },
    { k: 'prod', label: 'Producto', type: 'select', options: opts.products, required: true },
    { k: 'costo', label: 'Precio de compra (S/, sin IGV)', type: 'number', required: true, fmt: 'money' },
    { k: 'skuProv', label: 'Código del producto en el proveedor', mono: true, placeholder: 'Opcional' },
    { k: 'notas', label: 'Notas', wide: true, placeholder: 'Ej. mínimo de compra, presentación, vigencia' },
    { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] },
  ],
  note: 'Es el precio al que te vende ese proveedor. Si no hay precio registrado, al comprar se propone el costo promedio del producto y se puede escribir a mano.',
};
