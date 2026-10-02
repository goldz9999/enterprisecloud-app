import type { RecordsConfig } from '../../features/records/types';

export const recepcion: RecordsConfig = {
  active: 'Recepción',
  title: 'Recepción',
  subtitle: 'Ingreso de mercadería de proveedores al almacén. Cada recepción genera una nota de ingreso y aumenta el stock.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Compras' }, { label: 'Recepción' }],
  entity: 'Recepción de mercadería', titleKey: 'oc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por recibir': 'amber', 'Conforme': 'green', 'Con observaciones': 'red' },
  keys: ['ni','fecha','oc','prov','alm','items','estado','recibe'],
  columns: [{ k: 'ni', label: 'Nota de ingreso', w: '124px', mono: true, sub: 'fecha' }, { k: 'oc', label: 'Orden de compra', w: '120px', mono: true }, { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'items' }, { k: 'alm', label: 'Almacén', w: '120px', muted: true }, { k: 'estado', label: 'Estado', w: '140px', chip: true }],
  fields: [{ k: 'ni', label: 'Nota de ingreso', mono: true }, { k: 'fecha', label: 'Fecha' }, { k: 'oc', label: 'Orden de compra', mono: true }, { k: 'prov', label: 'Proveedor' }, { k: 'alm', label: 'Almacén' }, { k: 'recibe', label: 'Recibido por' }, { k: 'items', label: 'Mercadería', wide: true }],
  notes: { 'Por recibir': 'La orden fue aprobada y el proveedor debe entregar. Registra la recepción cuando llegue la mercadería.', 'Con observaciones': 'Se recibieron 4 cascos con fallas. El proveedor repondrá en su próxima entrega.' },
  actions: { 'Por recibir': [{ label: 'Registrar recepción →', href: '/compras/orden?paso=2', primary: true }], 'Conforme': [{ label: 'Ver nota de ingreso', href: '/documentos' }], 'Con observaciones': [{ label: 'Marcar observación como resuelta', to: 'Conforme', primary: true, toast: 'Observación resuelta' }] },
  rows: [
    ['Pendiente','Entrega 03 oct','OC-2026-0412','Aceros del Sur S.A.C.','Almacén Lima','3 ítems · 570 unidades','Por recibir','—'],
    ['Pendiente','Entrega 06 oct','OC-2026-0413','Cementos Pacasmayo Dist. S.A.','Almacén Lima','1 ítem · 500 bolsas','Por recibir','—'],
    ['NI-2026-0608','29 sep 2026','OC-2026-0409','Plásticos Lima S.R.L.','Almacén Callao','1 ítem · 120 unidades','Conforme','Jorge Quispe'],
    ['NI-2026-0603','22 sep 2026','OC-2026-0405','EPP Seguridad Total S.A.C.','Almacén Callao','2 ítems · 100 unidades','Con observaciones','Carlos Huamán'],
    ['NI-2026-0597','15 sep 2026','OC-2026-0401','Pinturas Andinas S.A.','Almacén Lima','1 ítem · 120 galones','Conforme','Jorge Quispe'],
    ['NI-2026-0590','09 sep 2026','OC-2026-0398','Cables y Conductores Perú S.A.','Almacén Lima','1 ítem · 30 rollos','Conforme','Carlos Huamán'],
  ],
};
