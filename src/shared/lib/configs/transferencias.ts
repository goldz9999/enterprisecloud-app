import type { RecordsConfig } from '@/shared/components/records/types';
import {
  cancelTransferRemote,
  createTransferRemote,
  dispatchTransferRemote,
  receiveTransferRemote,
} from '@/data/domain/inventory';
import { productByName } from '@/data/domain/stock';
import type { DB, Row } from '@/data/types';
import { opts, thisYear, todayLabel } from '@/shared/lib/config-utils';

export const transferencias: RecordsConfig = {
  active: 'Transferencias',
  title: 'Transferencias',
  subtitle: 'Traslado de mercadería entre almacenes. Descuenta del origen al despachar y suma al destino al confirmar la recepción.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Transferencias' }],
  newLabel: 'Nueva transferencia',
  collection: 'transferencias',
  entity: 'Transferencia', titleKey: 'cod', subKey: 'items', statusKey: 'estado', newTitle: 'Nueva transferencia', newKicker: 'Inventario', msgNew: 'Transferencia creada',
  statuses: { 'Pendiente': 'amber', 'En tránsito': 'blue', 'Recibida': 'green', 'Anulada': 'muted', 'Cancelada': 'muted' },
  keys: ['cod', 'fecha', 'orig', 'dest', 'items', 'resp', 'estado', 'prod', 'cant', 'origen', 'destino'],
  code: { key: 'cod', prefix: () => `TRF-${thisYear()}-`, width: 4 },
  defaults: () => ({ fecha: todayLabel(), estado: 'Pendiente' }),
  asyncCreate: async (d: DB, row: Row) => {
    if (row.orig === row.dest) return 'El almacén de origen y el de destino deben ser distintos.';
    if (!(Number(row.cant) > 0)) return 'La cantidad debe ser mayor que cero.';
    const p = productByName(d, String(row.prod));
    if (!p) return 'Producto no encontrado.';
    const res = await createTransferRemote({
      origen: String(row.orig),
      destino: String(row.dest),
      lines: [{
        sku: String(p.sku),
        name: String(p.nombre),
        unit: String(p.unidad || 'Unidad'),
        qty: Number(row.cant),
      }],
    });
    return res.ok ? undefined : res.error;
  },
  columns: [
    { k: 'cod', label: 'Código', w: '120px', mono: true, sub: 'fecha' },
    { k: 'origen', label: 'Origen', w: '120px' },
    { k: 'destino', label: 'Destino', w: '120px' },
    { k: 'items', label: 'Mercadería', w: 'minmax(0, 1fr)' },
    { k: 'estado', label: 'Estado', w: '112px', chip: true },
  ],
  fields: [
    { k: 'prod', label: 'Producto', type: 'select', options: opts.products, wide: true, required: true },
    { k: 'cant', label: 'Cantidad', type: 'number', required: true, placeholder: 'Unidades' },
    { k: 'resp', label: 'Responsable', type: 'select', options: opts.usersWithRole('Almacén') },
    { k: 'orig', label: 'Almacén origen', type: 'select', options: opts.warehouses },
    { k: 'dest', label: 'Almacén destino', type: 'select', options: opts.warehouses, value: d => opts.warehouses(d)[1] ?? opts.warehouses(d)[0] },
  ],
  notes: {
    'Pendiente': 'Al despachar se descuenta el stock del almacén de origen.',
    'En tránsito': 'Mercadería en camino. Confirma la recepción en el destino.',
    'Recibida': 'Stock sumado en el almacén destino.',
    'Cancelada': 'No se movió stock.',
  },
  actions: {
    'Pendiente': [
      { label: 'Despachar', primary: true, toast: 'Transferencia despachada', run: (_d, r) => { void dispatchTransferRemote(String(r.cod || r.uuid)); } },
      { label: 'Cancelar', danger: true, toast: 'Transferencia cancelada', run: (_d, r) => { void cancelTransferRemote(String(r.cod || r.uuid)); } },
    ],
    'En tránsito': [
      { label: 'Confirmar recepción', primary: true, toast: 'Transferencia recibida', run: (_d, r) => { void receiveTransferRemote(String(r.cod || r.uuid)); } },
    ],
  },
};
