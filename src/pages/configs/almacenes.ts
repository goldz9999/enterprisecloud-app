import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const almacenes: RecordsConfig = {
  active: 'Almacenes',
  title: 'Almacenes',
  subtitle: 'Locales físicos y virtuales donde se guarda la mercadería. Se usan en despachos, recepciones y transferencias.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Almacenes' }],
  newLabel: 'Nuevo almacén',
  crud: true, entity: 'Almacén', titleKey: 'nombre', subKey: 'cod', statusKey: 'estado', newTitle: 'Nuevo almacén', newKicker: 'Mantenimiento · Almacenes', msgNew: 'Almacén creado', msgDel: 'Almacén eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod', 'nombre', 'dir', 'distrito', 'resp', 'tipo', 'prods', 'valor', 'estado'],
  collection: 'almacenes',
  code: { key: 'cod', prefix: 'ALM-', width: 2 },
  view: (row, d) => {
    const items = d.records.stock.filter(s => s.alm === row.nombre && Number(s.stock) > 0);
    const cost = (sku: unknown) => Number(d.records.productos.find(p => p.sku === sku)?.costo ?? 0);
    return { ...row, prods: items.length, valor: Math.round(items.reduce((a, s) => a + Number(s.stock) * cost(s.sku), 0) * 100) / 100 };
  },
  onUpdate: (d, before, after) => {
    if (after.nombre !== before.nombre) for (const s of d.records.stock.filter(x => x.alm === before.nombre)) s.alm = after.nombre;
  },
  canDelete: (row, d) => {
    if (d.records.stock.some(s => s.alm === row.nombre && Number(s.stock) !== 0)) return 'El almacén tiene mercadería. Transfiérela antes de eliminarlo, o márcalo como Inactivo.';
    // Deletion allowed: drop its empty stock rows too.
    d.records.stock = d.records.stock.filter(s => s.alm !== row.nombre);
  },
  columns: [{ k: 'cod', label: 'Código', w: '80px', mono: true, muted: true }, { k: 'nombre', label: 'Almacén', w: 'minmax(0, 1fr)', sub: 'dir', bold: true }, { k: 'resp', label: 'Responsable', w: '124px', muted: true }, { k: 'tipo', label: 'Tipo', w: '100px', muted: true }, { k: 'valor', label: 'Valorizado', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'tipo', label: 'Tipo', type: 'select', options: ['Principal', 'Secundario', 'Tránsito'] }, { k: 'dir', label: 'Dirección', wide: true }, { k: 'distrito', label: 'Distrito / ciudad' }, { k: 'resp', label: 'Responsable', type: 'select', options: opts.masterUsers }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
};