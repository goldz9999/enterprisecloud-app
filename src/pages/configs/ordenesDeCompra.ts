import type { RecordsConfig } from '../../features/records/types';

export const ordenesDeCompra: RecordsConfig = {
  active: 'Órdenes de compra',
  title: 'Órdenes de compra',
  subtitle: 'Órdenes emitidas a proveedores a partir de solicitudes aprobadas. Abre una orden para avanzar su flujo.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Compras' }, { label: 'Órdenes de compra' }],
  entity: 'Orden de compra', titleKey: 'oc', subKey: 'prov', statusKey: 'estado',
  statuses: { 'Por aprobar': 'amber', 'Aprobada': 'blue', 'Recibida': 'blue', 'Facturada': 'amber', 'Pagada': 'green' },
  keys: ['oc','fecha','prov','ruc','entrega','total','estado','sol','comprador'],
  kpis: [{ label: 'Compras del mes', value: 'S/ 52,180', note: '↑ 4% vs. mes anterior' }, { label: 'Por recibir', value: '2', note: 'entregas esta semana', tone: 'amber' }, { label: 'Por aprobar', value: '1', note: 'requiere Gerencia', tone: 'amber' }],
  columns: [{ k: 'oc', label: 'Orden', w: '120px', mono: true, sub: 'fecha' }, { k: 'prov', label: 'Proveedor', w: 'minmax(0, 1fr)', sub: 'ruc' }, { k: 'entrega', label: 'Entrega', w: '96px', muted: true, mono: true }, { k: 'total', label: 'Total', w: '116px', fmt: 'money', align: 'right' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [{ k: 'oc', label: 'Orden', mono: true }, { k: 'fecha', label: 'Fecha' }, { k: 'prov', label: 'Proveedor', wide: true }, { k: 'ruc', label: 'RUC', mono: true }, { k: 'sol', label: 'Solicitud de origen', mono: true }, { k: 'comprador', label: 'Comprador' }, { k: 'entrega', label: 'Entrega pactada' }, { k: 'total', label: 'Total (inc. IGV)', fmt: 'money' }],
  actions: { 'Por aprobar': [{ label: 'Abrir y aprobar →', href: '/compras/orden?paso=1', primary: true }], 'Aprobada': [{ label: 'Abrir orden →', href: '/compras/orden', primary: true }], '*': [{ label: 'Abrir orden →', href: '/compras/orden?paso=5', primary: true }] },
  rows: [
    ['OC-2026-0413','01 oct 2026','Cementos Pacasmayo Dist. S.A.','20419387658','06 oct 2026',13039,'Por aprobar','SOL-2026-0089','Ana Torres'],
    ['OC-2026-0412','30 sep 2026','Aceros del Sur S.A.C.','20433221109','03 oct 2026',14393.64,'Aprobada','SOL-2026-0087','Ana Torres'],
    ['OC-2026-0409','24 sep 2026','Plásticos Lima S.R.L.','20377766554','29 sep 2026',3894,'Recibida','SOL-2026-0084','Ana Torres'],
    ['OC-2026-0405','18 sep 2026','EPP Seguridad Total S.A.C.','20566778899','22 sep 2026',2140.5,'Facturada','SOL-2026-0079','Ana Torres'],
    ['OC-2026-0401','10 sep 2026','Pinturas Andinas S.A.','20288877766','15 sep 2026',6320,'Pagada','SOL-2026-0074','Ana Torres'],
    ['OC-2026-0398','05 sep 2026','Cables y Conductores Perú S.A.','20511199988','09 sep 2026',4880,'Pagada','SOL-2026-0071','Ana Torres'],
  ],
};
