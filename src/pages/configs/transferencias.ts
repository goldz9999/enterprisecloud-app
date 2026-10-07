import type { RecordsConfig } from '../../features/records/types';
import { audit } from '../../data/domain/audit';
import { moveStock, productByName, stockRow } from '../../data/domain/stock';
import type { DB, Row } from '../../data/types';
import { opts, thisYear, todayLabel } from './shared';

const skuOf = (d: DB, r: Row) => String(productByName(d, String(r.prod))?.sku ?? '');

export const transferencias: RecordsConfig = {
  active: 'Transferencias',
  title: 'Transferencias',
  subtitle: 'Traslado de mercadería entre almacenes. Descuenta del origen al despachar y suma al destino al confirmar la recepción.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Transferencias' }],
  newLabel: 'Nueva transferencia',
  collection: 'transferencias',
  entity: 'Transferencia', titleKey: 'cod', subKey: 'items', statusKey: 'estado', newTitle: 'Nueva transferencia', newKicker: 'Inventario', msgNew: 'Transferencia creada',
  statuses: { 'Pendiente': 'amber', 'En tránsito': 'blue', 'Recibida': 'green', 'Anulada': 'muted' },
  keys: ['cod', 'fecha', 'orig', 'dest', 'items', 'resp', 'estado', 'prod', 'cant'],
  code: { key: 'cod', prefix: () => `TRF-${thisYear()}-`, width: 4 },
  defaults: () => ({ fecha: todayLabel(), estado: 'Pendiente' }),
  onCreate: (_d, row) => {
    if (row.orig === row.dest) return 'El almacén de origen y el de destino deben ser distintos.';
    if (!(Number(row.cant) > 0)) return 'La cantidad debe ser mayor que cero.';
    row.items = `${row.prod} × ${Number(row.cant).toLocaleString('en-US')}`;
  },
  columns: [{ k: 'cod', label: 'Código', w: '120px', mono: true, sub: 'fecha' }, { k: 'orig', label: 'Origen', w: '120px' }, { k: 'dest', label: 'Destino', w: '120px' }, { k: 'items', label: 'Mercadería', w: 'minmax(0, 1fr)', sub: 'resp' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [
    { k: 'prod', label: 'Producto', type: 'select', options: opts.products, wide: true, required: true },
    { k: 'cant', label: 'Cantidad', type: 'number', required: true, placeholder: 'Unidades' },
    { k: 'resp', label: 'Responsable', type: 'select', options: opts.usersWithRole('Almacén') },
    { k: 'orig', label: 'Almacén origen', type: 'select', options: opts.warehouses },
    { k: 'dest', label: 'Almacén destino', type: 'select', options: opts.warehouses, value: d => opts.warehouses(d)[1] ?? opts.warehouses(d)[0] },
  ],
  notes: { 'Pendiente': 'Al despachar se descuenta el stock del almacén de origen.', 'En tránsito': 'Confirma cuando la mercadería llegue al destino para sumar el stock.' },
  actions: {
    'Pendiente': [
      {
        label: 'Despachar', to: 'En tránsito', primary: true, toast: 'Transferencia despachada · stock descontado del origen',
        run: (d, r) => {
          const sku = skuOf(d, r);
          if (!sku) return 'Esta transferencia no tiene un producto del catálogo; no se puede mover stock.';
          if (d.settings.neg !== true && Number(stockRow(d, sku, String(r.orig))?.stock ?? 0) < Number(r.cant)) return `Stock insuficiente de ${r.prod} en ${r.orig}.`;
          moveStock(d, { sku, alm: String(r.orig), delta: -Number(r.cant), tipo: 'Transferencia', doc: String(r.cod) });
        },
      },
      { label: 'Anular', to: 'Anulada', danger: true, toast: 'Transferencia anulada' },
    ],
    'En tránsito': [
      {
        label: 'Confirmar recepción en destino', to: 'Recibida', primary: true, toast: 'Recepción confirmada · stock sumado al destino',
        run: (d, r) => {
          const sku = skuOf(d, r);
          if (sku) moveStock(d, { sku, alm: String(r.dest), delta: Number(r.cant), tipo: 'Transferencia', doc: String(r.cod) });
          else audit(d, { action: 'Editar', module: 'Inventario', ref: String(r.cod), desc: 'Recepción sin producto de catálogo: no se movió stock' });
        },
      },
    ],
  },
};