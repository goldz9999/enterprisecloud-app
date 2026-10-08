import type { RecordsConfig } from '../../features/records/types';
import { createCashRemote } from '../../data/domain/finance';
import { formatMoney } from '../../lib/format';
import { displayDate, isoDate } from '../../lib/dates';
import type { DB, Row } from '../../data/types';

export const caja: RecordsConfig = {
  active: 'Caja',
  title: 'Caja',
  subtitle: 'Movimientos de efectivo: cobros, pagos y ajustes manuales.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Caja' }],
  newLabel: 'Registrar movimiento',
  collection: 'caja',
  entity: 'Movimiento de caja', titleKey: 'desc', subKey: 'fecha', statusKey: 'estado', newTitle: 'Registrar movimiento de caja', newKicker: 'Finanzas · Caja', msgNew: 'Movimiento registrado',
  statuses: { 'Conciliado': 'green', 'Pendiente': 'amber' },
  keys: ['fecha', 'tipo', 'desc', 'ref', 'monto', 'estado'],
  defaults: () => ({ estado: 'Conciliado' }),
  asyncCreate: async (_d: DB, row: Row) => {
    if (!Number(row.monto)) return 'El monto debe ser mayor que cero.';
    const res = await createCashRemote({
      tipo: String(row.tipo || 'Ingreso'),
      monto: Number(row.monto),
      desc: String(row.desc || ''),
      ref: row.ref ? String(row.ref) : undefined,
    });
    return res.ok ? undefined : res.error;
  },
  kpis: rows => {
    const bal = rows.reduce((a, r) => a + Number(r.monto), 0);
    return [
      { label: 'Saldo de caja', value: formatMoney(bal), note: `${rows.length} movimientos` },
    ];
  },
  columns: [
    { k: 'fecha', label: 'Fecha', w: '140px', mono: true, muted: true },
    { k: 'desc', label: 'Descripción', w: 'minmax(0, 1fr)', sub: 'tipo' },
    { k: 'ref', label: 'Referencia', w: '120px', mono: true, muted: true },
    { k: 'monto', label: 'Monto', w: '124px', fmt: 'signed', align: 'right' },
    { k: 'estado', label: 'Estado', w: '112px', chip: true },
  ],
  fields: [
    { k: 'fecha', label: 'Fecha', type: 'date', value: () => isoDate(new Date()), required: true },
    { k: 'tipo', label: 'Tipo', type: 'select', options: ['Ingreso', 'Egreso'] },
    { k: 'monto', label: 'Monto (S/)', type: 'number', required: true },
    { k: 'desc', label: 'Descripción', wide: true, required: true },
    { k: 'ref', label: 'Referencia', mono: true },
  ],
};
