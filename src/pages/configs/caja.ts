import type { RecordsConfig } from '../../features/records/types';
import { currentUser } from '../../data/store';
import { fmtTime } from '../../lib/dates';
import { formatMoney as fmtM } from '../../lib/format';
import { opts, todayLabel } from './shared';

export const caja: RecordsConfig = {
  active: 'Caja',
  title: 'Caja',
  subtitle: 'Movimientos de efectivo del día: ventas de mostrador, cobros y gastos menores. Se cuadra al cierre.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Finanzas' }, { label: 'Caja' }],
  newLabel: 'Nuevo movimiento',
  collection: 'caja',
  entity: 'Movimiento de caja', titleKey: 'concepto', subKey: 'cod', statusKey: 'tipo', newTitle: 'Nuevo movimiento de caja', newKicker: 'Caja', msgNew: 'Movimiento registrado',
  statuses: { 'Ingreso': 'green', 'Egreso': 'red' },
  keys: ['cod','hora','concepto','tipo','monto','medio','resp'],
  code: { key: 'cod', prefix: 'MOV-CAJA-', width: 5 },
  defaults: () => ({ hora: fmtTime(new Date()), fecha: todayLabel() }),
  onSave: r => ({ ...r, monto: (r.tipo === 'Egreso' ? -1 : 1) * Math.abs(Number(r.monto) || 0) }),
  onCreate: (_d, row) => {
    if (!Number(row.monto)) return 'El monto debe ser mayor que cero.';
  },
  kpis: rows => {
    const opening = rows.filter(r => r.concepto === 'Apertura de caja');
    const open = opening.reduce((a, r) => a + Number(r.monto), 0);
    const amounts = rows.filter(r => r.concepto !== 'Apertura de caja').map(r => Number(r.monto));
    const ingresos = amounts.filter(m => m > 0);
    const egresos = amounts.filter(m => m < 0);
    const totalIn = ingresos.reduce((a, m) => a + m, 0);
    const totalOut = -egresos.reduce((a, m) => a + m, 0);
    return [
      { label: 'Apertura', value: fmtM(open), note: opening[0] ? `${opening[0].hora} · ${opening[0].resp}` : 'registra un movimiento "Apertura de caja"' },
      { label: 'Ingresos', value: fmtM(totalIn), note: ingresos.length + ' movimientos', tone: 'green' },
      { label: 'Egresos', value: fmtM(totalOut), note: egresos.length + ' movimientos', tone: 'red' },
      { label: 'Saldo en caja', value: fmtM(open + totalIn - totalOut), note: 'apertura + ingresos − egresos' },
    ];
  },
  columns: [{ k: 'cod', label: 'Movimiento', w: '130px', mono: true, sub: 'hora' }, { k: 'concepto', label: 'Concepto', w: 'minmax(0, 1fr)', sub: 'medio' }, { k: 'tipo', label: 'Tipo', w: '96px', chip: true }, { k: 'monto', label: 'Monto', w: '116px', fmt: 'signed', align: 'right' }, { k: 'resp', label: 'Responsable', w: '120px', muted: true }],
  fields: [
    { k: 'tipo', label: 'Tipo', type: 'select', options: ['Ingreso', 'Egreso'] },
    { k: 'monto', label: 'Monto (S/)', type: 'number', required: true, fmt: 'signed' },
    { k: 'concepto', label: 'Concepto', required: true, wide: true, placeholder: 'Ej. Pago de movilidad · o "Apertura de caja"' },
    { k: 'medio', label: 'Medio', type: 'select', options: ['Efectivo', 'Yape', 'Plin', 'POS'] },
    { k: 'resp', label: 'Responsable', type: 'select', options: opts.activeUsers, value: d => currentUser(d).name },
  ],
  rows: [
    ['MOV-CAJA-00884','10:32','Venta mostrador B001-01822','Ingreso',386.4,'Efectivo','María Rojas'],
    ['MOV-CAJA-00883','10:05','Compra de útiles de oficina','Egreso',-64.5,'Efectivo','Rosa Medina'],
    ['MOV-CAJA-00882','09:48','Cobro parcial F001-00187','Ingreso',500,'Yape','Rosa Medina'],
    ['MOV-CAJA-00881','09:20','Movilidad para despacho','Egreso',-45,'Efectivo','Carlos Huamán'],
    ['MOV-CAJA-00880','08:30','Apertura de caja','Ingreso',800,'Efectivo','Rosa Medina'],
  ],
};
