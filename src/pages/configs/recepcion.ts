import type { RecordsConfig } from '../../features/records/types';
import { getReceiptRows } from '../../data/domain/goodsReceipts';

export const recepcion: RecordsConfig = {
  active: 'Recepción',
  title: 'Recepción',
  subtitle: 'Ingreso de mercadería de proveedores al almacén. Cada recepción genera una nota de ingreso y aumenta el stock.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Compras' }, { label: 'Recepción' }],
  source: () => getReceiptRows(),
  entity: 'Recepción de mercadería', titleKey: 'oc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por recibir': 'amber', 'Conforme': 'green', 'Con observaciones': 'red' },
  keys: ['ni', 'fecha', 'oc', 'prov', 'alm', 'items', 'estado', 'recibe'],
  columns: [
    { k: 'ni', label: 'Nota de ingreso', w: '124px', mono: true, sub: 'fecha' },
    { k: 'oc', label: 'Orden de compra', w: '120px', mono: true },
    { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'items' },
    { k: 'alm', label: 'Almacén', w: '120px', muted: true },
    { k: 'estado', label: 'Estado', w: '140px', chip: true },
  ],
  fields: [
    { k: 'ni', label: 'Nota de ingreso', mono: true },
    { k: 'fecha', label: 'Fecha' },
    { k: 'oc', label: 'Orden de compra', mono: true },
    { k: 'prov', label: 'Proveedor' },
    { k: 'alm', label: 'Almacén' },
    { k: 'recibe', label: 'Recibido por' },
    { k: 'items', label: 'Mercadería', wide: true },
    { k: 'obs', label: 'Observación', wide: true },
  ],
  notes: {
    'Por recibir': 'La orden fue aprobada y el proveedor debe entregar. Registra la recepción cuando llegue la mercadería.',
    'Con observaciones': 'La mercadería llegó con observaciones. Márcala como resuelta cuando el proveedor regularice.',
  },
  actions: {
    'Por recibir': [{ label: 'Registrar recepción →', href: r => `/compras/orden/${r.oc}`, primary: true }],
    'Conforme': [
      { label: 'Ver nota de ingreso', href: r => `/documentos?q=${r.ni}` },
      { label: 'Abrir orden', href: r => `/compras/orden/${r.oc}` },
    ],
    'Con observaciones': [
      { label: 'Abrir orden', href: r => `/compras/orden/${r.oc}`, primary: true },
    ],
  },
};
