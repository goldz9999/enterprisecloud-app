import type { RecordsConfig } from '../../features/records/types';
import { parseDate } from '../../lib/dates';

export const kardex: RecordsConfig = {
  active: 'Kardex',
  title: 'Kardex',
  subtitle: 'Historial de movimientos de cada producto: entradas por compras, salidas por ventas, transferencias y ajustes, con saldo resultante.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Kardex' }],
  collection: 'kardex',
  entity: 'Movimiento de inventario', titleKey: 'doc', subKey: 'prod', statusKey: 'tipo',
  statuses: { 'Entrada': 'green', 'Salida': 'red', 'Transferencia': 'blue', 'Ajuste': 'amber' },
  keys: ['fecha','sku','prod','alm','tipo','doc','cant','saldo','costo','resp'],
  kpis: rows => {
    const now = new Date();
    const month = rows.filter(r => {
      const t = r.at ? new Date(String(r.at)) : parseDate(String(r.fecha));
      return t && t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
    });
    const ins = month.filter(r => r.tipo === 'Entrada');
    const outs = month.filter(r => r.tipo === 'Salida');
    return [
      { label: 'Entradas del mes', value: ins.reduce((a, r) => a + Number(r.cant), 0).toLocaleString('en-US') + ' und.', note: `${new Set(ins.map(r => r.doc)).size} notas de ingreso` },
      { label: 'Salidas del mes', value: (-outs.reduce((a, r) => a + Number(r.cant), 0)).toLocaleString('en-US') + ' und.', note: `${new Set(outs.map(r => r.doc)).size} guías de remisión` },
      { label: 'Método de costeo', value: 'Promedio', note: 'ponderado móvil' },
    ];
  },
  columns: [{ k: 'fecha', label: 'Fecha', w: '96px', mono: true, muted: true }, { k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'alm' }, { k: 'tipo', label: 'Tipo', w: '120px', chip: true }, { k: 'doc', label: 'Documento', w: '130px', mono: true }, { k: 'cant', label: 'Cantidad', w: '80px', fmt: 'sint', align: 'right' }, { k: 'saldo', label: 'Saldo', w: '70px', fmt: 'int', align: 'right' }],
  fields: [{ k: 'fecha', label: 'Fecha y hora' }, { k: 'tipo', label: 'Tipo' }, { k: 'prod', label: 'Producto', wide: true }, { k: 'sku', label: 'SKU', mono: true }, { k: 'alm', label: 'Almacén' }, { k: 'doc', label: 'Documento', mono: true }, { k: 'resp', label: 'Responsable' }, { k: 'cant', label: 'Cantidad', fmt: 'sint' }, { k: 'saldo', label: 'Saldo resultante', fmt: 'int' }, { k: 'costo', label: 'Costo unitario', fmt: 'money' }],
  note: 'Los movimientos del kardex no se editan: se generan automáticamente desde despachos, recepciones, transferencias y ajustes.',
  actions: { '*': [{ label: 'Ver documento de origen', href: r => `/documentos?q=${encodeURIComponent(String(r.doc))}` }] },
  rows: [
    ['02 oct 09:12','SKU-CEM-0042','Cemento Portland Tipo I 42.5 kg','Almacén Lima','Ajuste','AJ-2026-0112',-24,18,22.1,'Carlos Huamán'],
    ['01 oct 16:40','SKU-CEM-0042','Cemento Portland Tipo I 42.5 kg','Almacén Lima','Salida','SAL-2026-01938',-80,42,22.1,'Carlos Huamán'],
    ['30 sep 11:05','SKU-FIE-0912','Fierro corrugado 1/2" x 9 m','Almacén Callao','Salida','SAL-2026-01931',-400,310,34.92,'Carlos Huamán'],
    ['29 sep 15:22','SKU-PVC-0410','Tubo PVC 4" x 3 m clase 10','Almacén Callao','Entrada','NI-2026-0608',120,129,27.5,'Jorge Quispe'],
    ['29 sep 10:02','SKU-CEM-0042','Cemento Portland Tipo I 42.5 kg','Almacén Callao','Transferencia','TRF-2026-0088',200,420,22.1,'Jorge Quispe'],
    ['29 sep 09:40','SKU-CEM-0042','Cemento Portland Tipo I 42.5 kg','Almacén Lima','Transferencia','TRF-2026-0088',-200,122,22.1,'Jorge Quispe'],
    ['26 sep 08:55','SKU-PIN-0004','Pintura látex blanco 4 L','Almacén Lima','Salida','SAL-2026-01915',-12,8,38.9,'Carlos Huamán'],
    ['22 sep 12:30','SKU-EPP-0201','Casco de seguridad ANSI','Almacén Callao','Entrada','NI-2026-0603',40,140,12.9,'Carlos Huamán'],
    ['15 sep 10:10','SKU-PIN-0004','Pintura látex blanco 4 L','Almacén Lima','Entrada','NI-2026-0597',120,20,38.9,'Jorge Quispe'],
  ],
};
