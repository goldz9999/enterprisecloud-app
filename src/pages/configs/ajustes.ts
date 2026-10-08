import type { RecordsConfig } from '../../features/records/types';
import { createAdjustmentRemote } from '../../data/domain/inventory';
import { currentUser } from '../../data/store';
import type { DB, Row } from '../../data/types';
import { opts, thisYear, todayLabel } from './shared';

export const ajustes: RecordsConfig = {
  active: 'Ajustes',
  title: 'Ajustes de inventario',
  subtitle: 'Correcciones de stock por merma, sobrante, vencimiento u otras causas. Cada ajuste genera un movimiento en el kardex.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Ajustes' }],
  newLabel: 'Nuevo ajuste',
  collection: 'ajustes',
  entity: 'Ajuste', titleKey: 'cod', subKey: 'prod', statusKey: 'tipo', newTitle: 'Nuevo ajuste', newKicker: 'Inventario', msgNew: 'Ajuste registrado',
  statuses: { 'Merma': 'red', 'Sobrante': 'green', 'Vencimiento': 'amber', 'Corrección': 'blue' },
  keys: ['cod', 'fecha', 'prod', 'alm', 'tipo', 'cant', 'motivo', 'resp', 'sku'],
  code: { key: 'cod', prefix: () => `AJ-${thisYear()}-`, width: 4 },
  defaults: () => ({ fecha: todayLabel() }),
  asyncCreate: async (_d: DB, row: Row) => {
    if (!(Number(row.cant) > 0)) return 'La cantidad debe ser mayor que cero.';
    if (!row.motivo) return 'Indica el motivo del ajuste.';
    const res = await createAdjustmentRemote({
      prod: String(row.prod),
      alm: String(row.alm),
      tipo: String(row.tipo || 'Corrección'),
      cant: Number(row.cant),
      motivo: String(row.motivo),
    });
    return res.ok ? undefined : res.error;
  },
  columns: [
    { k: 'cod', label: 'Código', w: '120px', mono: true, sub: 'fecha' },
    { k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'sku' },
    { k: 'alm', label: 'Almacén', w: '120px', muted: true },
    { k: 'tipo', label: 'Tipo', w: '110px', chip: true },
    { k: 'cant', label: 'Cant.', w: '70px', fmt: 'int', align: 'right' },
  ],
  fields: [
    { k: 'prod', label: 'Producto', type: 'select', options: opts.products, wide: true, required: true },
    { k: 'alm', label: 'Almacén', type: 'select', options: opts.warehouses },
    { k: 'tipo', label: 'Tipo de ajuste', type: 'select', options: ['Merma', 'Sobrante', 'Vencimiento', 'Corrección'] },
    { k: 'cant', label: 'Cantidad', type: 'number', required: true, placeholder: 'Unidades' },
    { k: 'resp', label: 'Responsable', type: 'select', options: opts.activeUsers, value: d => currentUser(d).name },
    { k: 'motivo', label: 'Motivo', required: true, wide: true, placeholder: 'Describe la causa del ajuste' },
  ],
  note: 'Merma, vencimiento y corrección restan stock; sobrante suma. El ajuste se registra en el kardex al guardarlo.',
};
