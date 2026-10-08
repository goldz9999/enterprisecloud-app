import type { RecordsConfig } from '../../features/records/types';
import { createBankRemote, reconcileRemote } from '../../data/domain/finance';
import { formatMoney } from '../../lib/format';
import { isoDate } from '../../lib/dates';
import type { DB, Row } from '../../data/types';

export const bancos: RecordsConfig = {
  active: 'Bancos',
  title: 'Bancos',
  subtitle: 'Movimientos de las cuentas bancarias de la empresa. Concilia cada movimiento con su cobro, pago o comprobante.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Bancos' }],
  newLabel: 'Registrar movimiento',
  collection: 'bancos',
  entity: 'Movimiento bancario', titleKey: 'desc', subKey: 'cuenta', statusKey: 'estado', newTitle: 'Registrar movimiento bancario', newKicker: 'Finanzas · Bancos', msgNew: 'Movimiento registrado',
  statuses: { 'Conciliado': 'green', 'Pendiente': 'amber' },
  keys: ['fecha', 'desc', 'cuenta', 'ref', 'monto', 'estado', 'uuid'],
  defaults: () => ({ estado: 'Pendiente' }),
  asyncCreate: async (_d: DB, row: Row) => {
    if (!Number(row.monto)) return 'El monto debe ser mayor que cero.';
    const res = await createBankRemote({
      tipo: String(row.tipo || 'Abono'),
      monto: Number(row.monto),
      desc: String(row.desc || ''),
      cuenta: String(row.cuenta || ''),
      ref: row.ref ? String(row.ref) : undefined,
    });
    return res.ok ? undefined : res.error;
  },
  columns: [
    { k: 'fecha', label: 'Fecha', w: '96px', mono: true, muted: true },
    { k: 'desc', label: 'Descripción', w: 'minmax(0, 1fr)', sub: 'cuenta' },
    { k: 'ref', label: 'Referencia', w: '120px', mono: true, muted: true },
    { k: 'monto', label: 'Monto', w: '124px', fmt: 'signed', align: 'right' },
    { k: 'estado', label: 'Estado', w: '112px', chip: true },
  ],
  fields: [
    { k: 'fecha', label: 'Fecha', type: 'date', value: () => isoDate(new Date()), required: true },
    { k: 'cuenta', label: 'Cuenta', type: 'text', required: true, placeholder: 'Etiqueta de la cuenta (debe existir en BD)' },
    { k: 'tipo', label: 'Tipo', type: 'select', options: ['Abono', 'Cargo'] },
    { k: 'monto', label: 'Monto (S/)', type: 'number', required: true },
    { k: 'desc', label: 'Descripción', wide: true, required: true },
    { k: 'ref', label: 'Referencia', mono: true },
  ],
  notes: { 'Pendiente': 'Este movimiento aún no está vinculado a un cobro, pago o comprobante del ERP.' },
  actions: {
    'Pendiente': [{
      label: 'Conciliar con documento', to: 'Conciliado', primary: true, toast: 'Movimiento conciliado',
      fields: [{ k: 'doc', label: 'Documento relacionado', placeholder: 'Ej. F001-00248, OP 00481920' }],
      run: (_d, r, v) => {
        void reconcileRemote(String(r.uuid), v.doc ? String(v.doc) : undefined);
      },
    }],
  },
};
