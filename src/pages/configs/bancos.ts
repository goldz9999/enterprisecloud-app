import type { RecordsConfig } from '../../features/records/types';
import { bankAccounts, bankBalance } from '../../data/domain/finance';
import { isoDate, displayDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';

export const bancos: RecordsConfig = {
  active: 'Bancos',
  title: 'Bancos',
  subtitle: 'Movimientos de las cuentas bancarias de la empresa. Concilia cada movimiento con su cobro, pago o comprobante.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Bancos' }],
  newLabel: 'Registrar movimiento',
  collection: 'bancos',
  entity: 'Movimiento bancario', titleKey: 'desc', subKey: 'cuenta', statusKey: 'estado', newTitle: 'Registrar movimiento bancario', newKicker: 'Finanzas · Bancos', msgNew: 'Movimiento registrado',
  statuses: { 'Conciliado': 'green', 'Pendiente': 'amber' },
  keys: ['fecha', 'desc', 'cuenta', 'ref', 'monto', 'estado'],
  defaults: () => ({ estado: 'Pendiente' }),
  onSave: r => ({ ...r, fecha: displayDate(String(r.fecha)), monto: (r.tipo === 'Cargo' ? -1 : 1) * Math.abs(Number(r.monto) || 0) }),
  onCreate: (_d, row) => {
    if (!Number(row.monto)) return 'El monto debe ser mayor que cero.';
    delete row.tipo;
  },
  kpis: (_rows, d) => {
    const accounts = bankAccounts(d);
    if (!accounts.length) return [{ label: 'Sin cuentas bancarias', value: '—', note: 'agrégalas en Configuración › Tesorería' }];
    return accounts.map(a => ({ label: a, value: formatMoney(bankBalance(d, a)), note: `${d.records.bancos.filter(b => b.cuenta === a && b.estado === 'Pendiente').length} movimientos por conciliar` }));
  },
  columns: [{ k: 'fecha', label: 'Fecha', w: '96px', mono: true, muted: true }, { k: 'desc', label: 'Descripción', w: 'minmax(0, 1fr)', sub: 'cuenta' }, { k: 'ref', label: 'Referencia', w: '120px', mono: true, muted: true }, { k: 'monto', label: 'Monto', w: '124px', fmt: 'signed', align: 'right' }, { k: 'estado', label: 'Estado', w: '112px', chip: true }],
  fields: [
    { k: 'fecha', label: 'Fecha', type: 'date', value: () => isoDate(new Date()), required: true },
    { k: 'cuenta', label: 'Cuenta', type: 'select', options: bankAccounts, required: true },
    { k: 'tipo', label: 'Tipo', type: 'select', options: ['Abono', 'Cargo'] },
    { k: 'monto', label: 'Monto (S/)', type: 'number', required: true, fmt: 'signed' },
    { k: 'desc', label: 'Descripción', wide: true, required: true },
    { k: 'ref', label: 'Referencia', mono: true },
  ],
  notes: { 'Pendiente': 'Este movimiento aún no está vinculado a un cobro, pago o comprobante del ERP.' },
  actions: { 'Pendiente': [{ label: 'Conciliar con documento', to: 'Conciliado', primary: true, toast: 'Movimiento conciliado', fields: [{ k: 'doc', label: 'Documento relacionado', placeholder: 'Ej. F001-00248, OP 00481920' }], run: (_d, r, v) => { if (v.doc) r.ref = v.doc; } }] },
};