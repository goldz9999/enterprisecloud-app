import type { RecordsConfig } from '../../features/records/types';

export const comprobantes: RecordsConfig = {
  active: 'Comprobantes',
  title: 'Comprobantes',
  subtitle: 'Facturas, boletas y notas de crédito electrónicas emitidas a partir de las órdenes de venta.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Ventas' }, { label: 'Comprobantes' }],
  entity: 'Comprobante electrónico', titleKey: 'num', subKey: 'cliente', statusKey: 'sunat',
  statuses: { 'Aceptado': 'green', 'Pendiente': 'amber', 'Rechazado': 'red', 'Anulado': 'muted' },
  keys: ['num','tipo','cliente','ruc','emision','vence','total','sunat','orden'],
  kpis: [{ label: 'Emitidos en el mes', value: '48', note: 'S/ 84,250 facturado' }, { label: 'Pendientes SUNAT', value: '1', note: 'reenvío automático cada 30 min', tone: 'amber' }, { label: 'Rechazados', value: '1', note: 'requieren corrección', tone: 'red' }],
  columns: [{ k: 'num', label: 'Comprobante', w: '120px', mono: true, sub: 'tipo' }, { k: 'cliente', label: 'Cliente', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'emision', label: 'Emisión', w: '96px', muted: true, mono: true }, { k: 'total', label: 'Total', w: '116px', fmt: 'money', align: 'right' }, { k: 'sunat', label: 'Estado SUNAT', w: '116px', chip: true }],
  fields: [{ k: 'tipo', label: 'Tipo' }, { k: 'num', label: 'Serie y número', mono: true }, { k: 'cliente', label: 'Cliente', wide: true }, { k: 'ruc', label: 'RUC / DNI', mono: true }, { k: 'orden', label: 'Orden de origen', mono: true }, { k: 'emision', label: 'Emisión' }, { k: 'vence', label: 'Vencimiento' }, { k: 'total', label: 'Total (inc. IGV)', fmt: 'money' }, { k: 'sunat', label: 'Estado SUNAT' }],
  notes: { 'Pendiente': 'SUNAT aún no confirma la recepción. El sistema reintenta el envío automáticamente.', 'Rechazado': 'SUNAT rechazó el comprobante: el RUC del receptor no coincide con la razón social. Corrige los datos del cliente en Mantenimiento.', 'Anulado': 'Comprobante anulado mediante nota de crédito. No genera cuenta por cobrar.' },
  actions: { 'Pendiente': [{ label: 'Reenviar a SUNAT', to: 'Aceptado', primary: true, toast: 'Comprobante aceptado por SUNAT' }], 'Aceptado': [{ label: 'Descargar PDF y XML', href: '/documentos' }, { label: 'Anular con nota de crédito', to: 'Anulado', danger: true, toast: 'Nota de crédito emitida' }], 'Rechazado': [{ label: 'Corregir y reenviar', to: 'Pendiente', primary: true, toast: 'Comprobante reenviado a SUNAT' }] },
  rows: [
    ['F001-00249','Factura','Constructora Pacífico E.I.R.L.','20601122334','03 oct 2026','02 nov 2026',8920.5,'Pendiente','OV-2026-1283'],
    ['F001-00248','Factura','Distribuidora Andina S.A.C.','20512345671','02 oct 2026','01 nov 2026',12480,'Aceptado','OV-2026-1284'],
    ['F001-00247','Factura','Minera Los Andes S.A.','20100987652','01 oct 2026','15 nov 2026',21300,'Aceptado','OV-2026-1282'],
    ['B001-01822','Boleta','Juan Carlos Mendoza','DNI 41827364','01 oct 2026','01 oct 2026',386.4,'Aceptado','OV-2026-1279'],
    ['F001-00241','Factura','Farmacias Salud Total S.A.C.','20488776651','27 sep 2026','27 sep 2026',3145.9,'Aceptado','OV-2026-1281'],
    ['F001-00240','Factura','Textil Arequipa S.R.L.','20455667788','26 sep 2026','26 oct 2026',6760,'Rechazado','OV-2026-1280'],
    ['FC01-00032','Nota de crédito','Comercial Norte Trujillo S.A.','20399887766','22 sep 2026','—',-1250,'Aceptado','F001-00219'],
    ['F001-00236','Factura','Inversiones Cusco Plaza S.A.C.','20522334455','20 sep 2026','20 oct 2026',2930,'Anulado','OV-2026-1266'],
  ],
};
