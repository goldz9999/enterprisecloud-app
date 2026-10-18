import type { RecordsConfig } from '@/shared/components/records/types';
import { formatMoney } from '@/shared/lib/format';

export const stock: RecordsConfig & { sidePanel: boolean } = {
  active: 'Stock por almacén',
  title: 'Stock por almacén',
  subtitle: 'Existencias actuales por producto y almacén, comparadas con el stock mínimo definido en Mantenimiento.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Stock por almacén' }],
  collection: 'stock',
  entity: 'Stock de producto', titleKey: 'prod', subKey: 'sku', statusKey: 'estado',
  statuses: { 'Normal': 'green', 'Bajo mínimo': 'red', 'Sin stock': 'red', 'Sobrestock': 'amber' },
  keys: ['sku', 'prod', 'cat', 'alm', 'stock', 'min', 'res', 'estado'],
  view: (row, d) => ({ ...row, disp: Number(row.stock) - Number(row.res), valor: Number(row.stock) * Number(d.records.productos.find(p => p.sku === row.sku)?.costo ?? 0) }),
  kpis: (rows, d) => [
    { label: 'Valor del inventario', value: formatMoney(rows.reduce((a, r) => a + Number(r.valor), 0)), note: `${new Set(rows.filter(r => Number(r.stock) > 0).map(r => r.alm)).size} almacenes con stock · ${d.records.productos.length} productos` },
    { label: 'Bajo mínimo o sin stock', value: String(rows.filter(r => r.estado === 'Bajo mínimo' || r.estado === 'Sin stock').length), note: 'requieren reposición', tone: 'red' },
    { label: 'Sobrestock', value: String(rows.filter(r => r.estado === 'Sobrestock').length), note: 'considerar transferencia', tone: 'amber' },
  ],
  sidePanel: true,
  columns: [{ k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'sku' }, { k: 'alm', label: 'Almacén', w: '120px', muted: true }, { k: 'stock', label: 'Stock', w: '70px', fmt: 'int', align: 'right' }, { k: 'min', label: 'Mínimo', w: '70px', fmt: 'int', align: 'right', muted: true }, { k: 'res', label: 'Reservado', w: '80px', fmt: 'int', align: 'right', muted: true }, { k: 'estado', label: 'Estado', w: '110px', chip: true }],
  fields: [{ k: 'prod', label: 'Producto', wide: true }, { k: 'sku', label: 'SKU', mono: true }, { k: 'cat', label: 'Categoría' }, { k: 'alm', label: 'Almacén' }, { k: 'stock', label: 'Stock actual', fmt: 'int' }, { k: 'min', label: 'Stock mínimo', fmt: 'int' }, { k: 'res', label: 'Reservado por órdenes', fmt: 'int' }, { k: 'disp', label: 'Disponible para venta', fmt: 'int' }, { k: 'valor', label: 'Valorizado (costo prom.)', fmt: 'money' }],
  note: 'El stock cambia con despachos, recepciones, transferencias y ajustes. El mínimo se define en Mantenimiento › Productos.',
  actions: {
    'Bajo mínimo': [{ label: 'Crear solicitud de compra →', href: r => `/compras/solicitudes?nuevo=${r.sku}&alm=${encodeURIComponent(String(r.alm))}`, primary: true }, { label: 'Ver kardex', href: r => `/inventario/kardex?q=${r.sku}` }],
    'Sin stock': [{ label: 'Crear solicitud de compra →', href: r => `/compras/solicitudes?nuevo=${r.sku}&alm=${encodeURIComponent(String(r.alm))}`, primary: true }, { label: 'Ver kardex', href: r => `/inventario/kardex?q=${r.sku}` }],
    'Sobrestock': [{ label: 'Crear transferencia', href: '/inventario/transferencias', primary: true }, { label: 'Ver kardex', href: r => `/inventario/kardex?q=${r.sku}` }],
    'Normal': [{ label: 'Ver kardex', href: r => `/inventario/kardex?q=${r.sku}` }],
  },
};