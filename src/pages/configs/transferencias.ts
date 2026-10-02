import type { RecordsConfig } from '../../features/records/types';

export const transferencias: RecordsConfig = {
  active: 'Transferencias',
  title: 'Transferencias',
  subtitle: 'Traslado de mercadería entre almacenes. Descuenta del origen al despachar y suma al destino al confirmar la recepción.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Transferencias' }],
  newLabel: 'Nueva transferencia',
  entity: 'Transferencia', titleKey: 'cod', subKey: 'items', statusKey: 'estado', newTitle: 'Nueva transferencia', newKicker: 'Inventario', msgNew: 'Transferencia creada',
  statuses: { 'Pendiente': 'amber', 'En tránsito': 'blue', 'Recibida': 'green', 'Anulada': 'muted' },
  keys: ['cod','fecha','orig','dest','items','resp','estado'],
  defaults: n => ({ cod: 'TRF-2026-' + String(91 + n - 6).padStart(4, '0'), fecha: '02 oct 2026', estado: 'Pendiente' }),
  columns: [{ k: 'cod', label: 'Código', w: '120px', mono: true, sub: 'fecha' }, { k: 'orig', label: 'Origen', w: '120px' }, { k: 'dest', label: 'Destino', w: '120px' }, { k: 'items', label: 'Mercadería', w: 'minmax(0, 1fr)', sub: 'resp' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [{ k: 'orig', label: 'Almacén origen', type: 'select', options: ['Almacén Lima', 'Almacén Callao'] }, { k: 'dest', label: 'Almacén destino', type: 'select', options: ['Almacén Callao', 'Almacén Lima'] }, { k: 'items', label: 'Productos y cantidades', required: true, wide: true, placeholder: 'Ej. Cemento Portland 42.5 kg × 100' }, { k: 'resp', label: 'Responsable', type: 'select', options: ['Jorge Quispe', 'Carlos Huamán'] }],
  notes: { 'Pendiente': 'Al despachar se descuenta el stock del almacén de origen y la mercadería pasa al almacén en tránsito.', 'En tránsito': 'Confirma cuando la mercadería llegue al destino para sumar el stock.' },
  actions: { 'Pendiente': [{ label: 'Despachar', to: 'En tránsito', primary: true, toast: 'Transferencia despachada · stock descontado del origen' }, { label: 'Anular', to: 'Anulada', danger: true, toast: 'Transferencia anulada' }], 'En tránsito': [{ label: 'Confirmar recepción en destino', to: 'Recibida', primary: true, toast: 'Recepción confirmada · stock sumado al destino' }] },
  rows: [
    ['TRF-2026-0091','02 oct 2026','Almacén Callao','Almacén Lima','Cemento Portland 42.5 kg × 150','Jorge Quispe','Pendiente'],
    ['TRF-2026-0090','01 oct 2026','Almacén Lima','Almacén Callao','Cable THW 12 AWG × 10','Carlos Huamán','En tránsito'],
    ['TRF-2026-0089','30 sep 2026','Almacén Callao','Almacén Lima','Casco de seguridad × 60, Guantes de nitrilo × 20','Carlos Huamán','En tránsito'],
    ['TRF-2026-0088','29 sep 2026','Almacén Lima','Almacén Callao','Cemento Portland 42.5 kg × 200 y 5 ítems más','Jorge Quispe','Recibida'],
    ['TRF-2026-0085','20 sep 2026','Almacén Lima','Almacén Callao','Ladrillo King Kong × 1,000','Jorge Quispe','Recibida'],
    ['TRF-2026-0083','15 sep 2026','Almacén Callao','Almacén Lima','Tubo PVC 4" × 30','Carlos Huamán','Anulada'],
  ],
};
