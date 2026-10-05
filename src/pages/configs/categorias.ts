import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const categorias: RecordsConfig = {
  active: 'Categorías',
  title: 'Categorías',
  subtitle: 'Agrupación de productos para reportes, márgenes objetivo y búsqueda.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Categorías' }],
  newLabel: 'Nueva categoría',
  crud: true, entity: 'Categoría', titleKey: 'nombre', subKey: 'cod', statusKey: 'estado', newTitle: 'Nueva categoría', newKicker: 'Mantenimiento · Categorías', msgNew: 'Categoría creada', msgDel: 'Categoría eliminada',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['cod','nombre','desc','padre','prods','margen','estado'],
  collection: 'categorias',
  code: { key: 'cod', prefix: 'CAT-', width: 2 },
  view: (row, d) => ({ ...row, prods: d.records.productos.filter(p => p.cat === row.nombre).length }),
  onUpdate: (d, before, after) => {
    if (after.nombre !== before.nombre) for (const p of d.records.productos.filter(x => x.cat === before.nombre)) p.cat = after.nombre;
  },
  canDelete: (row, d) => {
    if (d.records.productos.some(p => p.cat === row.nombre)) return 'No se puede eliminar una categoría con productos asociados; primero reasígnalos.';
  },
  columns: [{ k: 'cod', label: 'Código', w: '80px', mono: true, muted: true }, { k: 'nombre', label: 'Categoría', w: 'minmax(0, 1fr)', sub: 'desc', bold: true }, { k: 'padre', label: 'Categoría padre', w: '130px', muted: true }, { k: 'prods', label: 'Productos', w: '84px', fmt: 'int', align: 'right' }, { k: 'margen', label: 'Margen obj.', w: '90px', align: 'right', mono: true }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'padre', label: 'Categoría padre', type: 'select', options: d => ['—', ...opts.categories(d)] }, { k: 'desc', label: 'Descripción', wide: true }, { k: 'margen', label: 'Margen objetivo', placeholder: 'Ej. 25%' }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'No se puede eliminar una categoría con productos asociados; primero reasígnalos.',
  rows: [
    ['CAT-01','Construcción','Cemento, fierro, agregados y ladrillos','—',42,'22%','Activo'],
    ['CAT-02','Ferretería','Clavos, pernos y herramientas manuales','—',118,'30%','Activo'],
    ['CAT-03','Gasfitería','Tuberías, conexiones y pegamentos','—',64,'28%','Activo'],
    ['CAT-04','Eléctricos','Cables, interruptores y tableros','—',51,'25%','Activo'],
    ['CAT-05','Acabados','Pinturas, cerámicos y revestimientos','—',37,'32%','Activo'],
    ['CAT-06','EPP','Equipos de protección personal','—',29,'35%','Activo'],
    ['CAT-07','Pinturas esmalte','Esmaltes sintéticos y anticorrosivos','Acabados',12,'34%','Inactivo'],
  ],
};
