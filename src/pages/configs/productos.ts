import { moveStock, stockStatus } from '../../data/domain/stock';
import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const productos: RecordsConfig = {
  active: 'Productos',
  title: 'Productos',
  subtitle: 'Catálogo maestro de productos con precios, costos y stock mínimo. El stock por almacén se consulta en Inventario.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Mantenimiento' }, { label: 'Productos' }],
  newLabel: 'Nuevo producto',
  crud: true, entity: 'Producto', titleKey: 'nombre', subKey: 'sku', statusKey: 'estado', newTitle: 'Nuevo producto', newKicker: 'Mantenimiento · Productos', msgNew: 'Producto creado', msgDel: 'Producto eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['sku','nombre','cat','unidad','precio','costo','min','prov','igv','estado'],
  collection: 'productos',
  onCreate: (d, row) => {
    if (d.records.productos.some(p => String(p.sku).toLowerCase() === String(row.sku).toLowerCase())) return `Ya existe un producto con el SKU ${row.sku}.`;
    // Start with a zero-stock row in the default warehouse so it shows in Stock por almacén.
    const alm = String(d.settings.almdef || opts.warehouses(d)[0]);
    const st = moveStock(d, { sku: String(row.sku), name: String(row.nombre), alm, delta: 0 });
    Object.assign(st, { cat: row.cat, min: Number(row.min) || 0, estado: stockStatus(0, Number(row.min) || 0) });
  },
  onUpdate: (d, before, after) => {
    if (after.sku !== before.sku && d.records.productos.some(p => p !== before && p.sku === after.sku)) return `Ya existe un producto con el SKU ${after.sku}.`;
    for (const s of d.records.stock.filter(x => x.sku === before.sku)) {
      Object.assign(s, { sku: after.sku, prod: after.nombre, cat: after.cat, min: after.min });
      s.estado = stockStatus(Number(s.stock), Number(s.min));
    }
  },
  canDelete: (row, d) => {
    if (d.records.stock.some(s => s.sku === row.sku && Number(s.stock) !== 0)) return 'El producto tiene stock en almacén. Ajusta el stock a cero o márcalo como Inactivo.';
    if (d.orders.some(o => o.lines.some(l => l.sku === row.sku))) return 'El producto aparece en órdenes registradas. Márcalo como Inactivo para conservar el historial.';
    // Deletion allowed: drop its empty stock rows too.
    d.records.stock = d.records.stock.filter(s => s.sku !== row.sku);
  },
  columns: [{ k: 'sku', label: 'SKU', w: '116px', mono: true, muted: true }, { k: 'nombre', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'cat', bold: true }, { k: 'unidad', label: 'Unidad', w: '72px', muted: true }, { k: 'precio', label: 'Precio venta', w: '100px', fmt: 'money', align: 'right' }, { k: 'costo', label: 'Costo prom.', w: '100px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'sku', label: 'SKU', required: true, placeholder: 'SKU-XXX-0000' }, { k: 'cat', label: 'Categoría', type: 'select', options: opts.categories }, { k: 'nombre', label: 'Nombre del producto', required: true, wide: true }, { k: 'unidad', label: 'Unidad de medida', type: 'select', options: ['Unidad', 'Bolsa', 'Varilla', 'Kg', 'Galón', 'Rollo', 'Caja'] }, { k: 'igv', label: 'Afecto a IGV', type: 'select', options: ['Sí', 'No'] }, { k: 'precio', label: 'Precio de venta (S/)', type: 'number', required: true, fmt: 'money' }, { k: 'costo', label: 'Costo promedio (S/)', type: 'number', fmt: 'money' }, { k: 'min', label: 'Stock mínimo', type: 'number', fmt: 'int' }, { k: 'prov', label: 'Proveedor principal', type: 'select', options: opts.suppliers }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'El costo promedio se recalcula automáticamente con cada recepción de compra. El stock mínimo dispara las alertas de reposición.',
  rows: [
    ['SKU-CEM-0042','Cemento Portland Tipo I 42.5 kg','Construcción','Bolsa',28.5,22.1,150,'Cementos Pacasmayo Dist. S.A.','Sí','Activo'],
    ['SKU-FIE-0912','Fierro corrugado 1/2" x 9 m','Construcción','Varilla',41.2,34.92,100,'Aceros del Sur S.A.C.','Sí','Activo'],
    ['SKU-ALA-0016','Alambre negro recocido N.º 16','Construcción','Kg',6.2,5.4,80,'Aceros del Sur S.A.C.','Sí','Activo'],
    ['SKU-CLA-0300','Clavos para madera 3"','Ferretería','Kg',9.71,7.9,40,'Aceros del Sur S.A.C.','Sí','Activo'],
    ['SKU-PVC-0410','Tubo PVC 4" x 3 m clase 10','Gasfitería','Unidad',36.9,27.5,40,'Plásticos Lima S.R.L.','Sí','Activo'],
    ['SKU-PEG-0025','Pegamento PVC 1/4 gal','Gasfitería','Unidad',24.5,17.8,20,'Plásticos Lima S.R.L.','Sí','Activo'],
    ['SKU-PIN-0004','Pintura látex blanco 4 L','Acabados','Galón',52.3,38.9,25,'Pinturas Andinas S.A.','Sí','Activo'],
    ['SKU-CAB-1200','Cable THW 12 AWG x 100 m','Eléctricos','Rollo',189,142,10,'Cables y Conductores Perú S.A.','Sí','Activo'],
    ['SKU-EPP-1103','Guantes de nitrilo talla M x100','EPP','Caja',24.6,17.2,30,'EPP Seguridad Total S.A.C.','Sí','Activo'],
    ['SKU-LAD-1818','Ladrillo King Kong 18 huecos','Construcción','Unidad',0.92,0.68,2000,'Cementos Pacasmayo Dist. S.A.','Sí','Activo'],
    ['SKU-EPP-0310','Lentes de seguridad claros','EPP','Unidad',8.5,5.2,24,'EPP Seguridad Total S.A.C.','Sí','Activo'],
    ['SKU-EPP-0201','Casco de seguridad ANSI','EPP','Unidad',18.4,12.9,30,'EPP Seguridad Total S.A.C.','Sí','Inactivo'],
  ],
};
