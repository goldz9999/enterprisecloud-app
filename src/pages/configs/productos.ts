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
  keys: ['sku', 'nombre', 'cat', 'unidad', 'precio', 'costo', 'min', 'prov', 'igv', 'estado'],
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
};