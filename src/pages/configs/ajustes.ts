import type { RecordsConfig } from '../../features/records/types';
import { moveStock, productByName } from '../../data/domain/stock';
import { currentUser } from '../../data/store';
import { opts, thisYear, todayLabel } from './shared';

export const ajustes: RecordsConfig = {
  active: 'Ajustes',
  title: 'Ajustes de inventario',
  subtitle: 'Correcciones de stock por mermas, sobrantes, vencimientos o errores. Cada ajuste genera un movimiento en el kardex.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Inventario' }, { label: 'Ajustes de inventario' }],
  newLabel: 'Nuevo ajuste',
  collection: 'ajustes',
  entity: 'Ajuste de inventario', titleKey: 'cod', subKey: 'prod', statusKey: 'tipo', newTitle: 'Nuevo ajuste de inventario', newKicker: 'Inventario', msgNew: 'Ajuste registrado y enviado al kardex',
  statuses: { 'Merma': 'red', 'Sobrante': 'green', 'Vencimiento': 'amber', 'Corrección': 'blue' },
  keys: ['cod','fecha','prod','alm','tipo','cant','motivo','resp'],
  code: { key: 'cod', prefix: () => `AJ-${thisYear()}-`, width: 4 },
  defaults: () => ({ fecha: todayLabel() }),
  onSave: r => ({ ...r, cant: (r.tipo === 'Sobrante' ? 1 : -1) * Math.abs(Number(r.cant) || 0) }),
  onCreate: (d, row) => {
    const p = productByName(d, String(row.prod));
    if (!p) return 'Elige un producto del catálogo.';
    if (!Number(row.cant)) return 'La cantidad debe ser mayor que cero.';
    moveStock(d, { sku: String(p.sku), alm: String(row.alm), delta: Number(row.cant), tipo: 'Ajuste', doc: String(row.cod) });
  },
  onUpdate: () => 'Los ajustes no se editan: registra un nuevo ajuste de corrección.',
  canDelete: () => 'Los ajustes no se eliminan porque ya movieron el stock: registra un ajuste de corrección.',
  columns: [{ k: 'cod', label: 'Código', w: '120px', mono: true, sub: 'fecha' }, { k: 'prod', label: 'Producto', w: 'minmax(0, 1fr)', sub: 'alm' }, { k: 'tipo', label: 'Tipo', w: '116px', chip: true }, { k: 'cant', label: 'Cantidad', w: '80px', fmt: 'sint', align: 'right' }, { k: 'resp', label: 'Responsable', w: '120px', muted: true }],
  fields: [
    { k: 'prod', label: 'Producto', type: 'select', options: opts.products, wide: true, required: true },
    { k: 'alm', label: 'Almacén', type: 'select', options: opts.warehouses },
    { k: 'tipo', label: 'Tipo de ajuste', type: 'select', options: ['Merma', 'Sobrante', 'Vencimiento', 'Corrección'] },
    { k: 'cant', label: 'Cantidad', type: 'number', required: true, placeholder: 'Unidades' },
    { k: 'resp', label: 'Responsable', type: 'select', options: opts.activeUsers, value: d => currentUser(d).name },
    { k: 'motivo', label: 'Motivo', required: true, wide: true, placeholder: 'Describe la causa del ajuste' },
  ],
  note: 'Merma, vencimiento y corrección restan stock; sobrante suma. El ajuste se registra en el kardex al guardarlo.',
  rows: [
    ['AJ-2026-0112','02 oct 2026','Cemento Portland Tipo I 42.5 kg','Almacén Lima','Merma',-24,'Bolsas dañadas por humedad','Carlos Huamán'],
    ['AJ-2026-0111','28 sep 2026','Clavos para madera 3"','Almacén Callao','Sobrante',3,'Diferencia en inventario cíclico','Jorge Quispe'],
    ['AJ-2026-0109','20 sep 2026','Guantes de nitrilo talla M x100','Almacén Lima','Vencimiento',-6,'Lote vencido L-2209','Carlos Huamán'],
    ['AJ-2026-0106','12 sep 2026','Pintura látex blanco 4 L','Almacén Lima','Corrección',-2,'Error de digitación en NI-2026-0590','Rosa Medina'],
    ['AJ-2026-0102','03 sep 2026','Fierro corrugado 1/2" x 9 m','Almacén Callao','Merma',-4,'Varillas dobladas en la descarga','Jorge Quispe'],
  ],
};
