import type { RecordsConfig } from '@/shared/components/records/types';
import { parseDate } from '@/lib/dates';

export const kardex: RecordsConfig = {
  active: 'Movimientos Kardex',
  title: 'Movimientos Kardex',
  subtitle: 'Registro de las variaciones de inventario: entradas por recepciones, salidas por despachos, transferencias y ajustes, con existencias anteriores y posteriores. La recepción de mercadería se gestiona en Kardex.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Movimientos Kardex' }],
  collection: 'kardex',
  entity: 'Movimiento de inventario', titleKey: 'doc', subKey: 'prod', statusKey: 'tipo',
  statuses: { 'Entrada': 'green', 'Salida': 'red', 'Transferencia': 'blue', 'Ajuste': 'amber' },
  keys: ['fecha', 'sku', 'prod', 'alm', 'tipo', 'doc', 'cant', 'delta', 'antes', 'saldo', 'costo', 'resp'],
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
  columns: [{ k: 'fecha', label: 'Fecha', w: '96px', mono: true, muted: true }, { k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'alm' }, { k: 'tipo', label: 'Tipo', w: '120px', chip: true }, { k: 'doc', label: 'Documento', w: '130px', mono: true }, { k: 'delta', label: 'Cantidad', w: '80px', fmt: 'sint', align: 'right' }, { k: 'saldo', label: 'Saldo', w: '70px', fmt: 'int', align: 'right' }],
  fields: [{ k: 'fecha', label: 'Fecha y hora' }, { k: 'tipo', label: 'Tipo' }, { k: 'prod', label: 'Producto', wide: true }, { k: 'sku', label: 'SKU', mono: true }, { k: 'alm', label: 'Almacén' }, { k: 'doc', label: 'Documento u operación de origen', mono: true }, { k: 'resp', label: 'Responsable' }, { k: 'delta', label: 'Cantidad', fmt: 'sint' }, { k: 'antes', label: 'Existencias anteriores', fmt: 'int' }, { k: 'saldo', label: 'Existencias posteriores', fmt: 'int' }, { k: 'costo', label: 'Costo unitario', fmt: 'money' }],
  note: 'Los movimientos del kardex no se editan: se generan automáticamente desde despachos, recepciones, transferencias y ajustes.',
  actions: { '*': [{ label: 'Ver documento de origen', href: r => `/documentos?q=${encodeURIComponent(String(r.doc))}` }] },
};