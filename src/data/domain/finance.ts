import { addDays, daysBetween, fmtDate, fmtDayMonth, fmtTime, parseDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { currentUser, nextCode, nextId } from '../store';
import type { DB, Row } from '../types';
import { audit } from './audit';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bank accounts configured in Configuración (one per line or comma-separated). */
export function bankAccounts(d: DB): string[] {
  const fromSettings = String(d.settings.cuentas ?? '')
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
  const fromMovements = d.records.bancos.map(b => String(b.cuenta));
  return [...new Set([...fromSettings, ...Object.keys(d.bankOpening), ...fromMovements])];
}

export function bankBalance(d: DB, account: string): number {
  return (d.bankOpening[account] ?? 0) + d.records.bancos.filter(b => b.cuenta === account).reduce((a, b) => a + Number(b.monto), 0);
}

export interface Payment {
  amount: number;
  /** "Efectivo" goes to Caja; anything else to the bank account. */
  medio: string;
  cuenta: string;
  op: string;
  date?: Date;
}

/** Records cash or bank movement for a payment. Positive = money in. */
function moveMoney(d: DB, signedAmount: number, p: Payment, desc: string) {
  const when = p.date ?? new Date();
  if (p.medio === 'Efectivo' || !p.cuenta) {
    d.records.caja.unshift({
      _id: nextId(d.records.caja),
      cod: nextCode(d, 'MOV-CAJA-', 5),
      hora: fmtTime(new Date()),
      concepto: desc,
      tipo: signedAmount >= 0 ? 'Ingreso' : 'Egreso',
      monto: round2(signedAmount),
      medio: p.medio === 'Efectivo' ? 'Efectivo' : p.medio || 'Efectivo',
      resp: currentUser(d).name,
    });
  } else {
    d.records.bancos.unshift({
      _id: nextId(d.records.bancos),
      fecha: fmtDate(when),
      desc,
      cuenta: p.cuenta,
      ref: p.op || '—',
      monto: round2(signedAmount),
      estado: 'Conciliado',
    });
  }
}

function dueText(n: number): string {
  if (n > 0) return `vence en ${n} día${n === 1 ? '' : 's'}`;
  if (n === 0) return 'vence hoy';
  return `${-n} día${n === -1 ? '' : 's'} vencida`;
}

/** Receivable with "días" text and overdue status computed against today. */
export function receivableView(row: Row): Row {
  if (row.estado === 'Cobrada') return row;
  const due = parseDate(String(row.vence));
  if (!due) return row;
  const n = daysBetween(new Date(), due);
  return { ...row, dias: dueText(n), estado: row.estado === 'Cobro parcial' ? 'Cobro parcial' : n < 0 ? 'Vencida' : 'Por vencer' };
}

/** Payable with "días" text and status computed against today. */
export function payableView(row: Row): Row {
  if (row.estado === 'Pagada') return row;
  const due = parseDate(String(row.vence));
  if (!due) return row;
  const n = daysBetween(new Date(), due);
  return { ...row, dias: dueText(n), estado: n < 0 ? 'Vencida' : n <= 7 ? 'Vence esta semana' : 'Por vencer' };
}

export function createReceivable(d: DB, r: { doc: string; cliente: string; ruc: string; total: number; vence: Date; orden?: string }): Row {
  const row: Row = {
    _id: nextId(d.records.cxc),
    doc: r.doc,
    emision: fmtDate(new Date()),
    cliente: r.cliente,
    ruc: r.ruc,
    vence: fmtDate(r.vence),
    total: round2(r.total),
    saldo: round2(r.total),
    estado: daysBetween(new Date(), r.vence) < 0 ? 'Vencida' : 'Por vencer',
    dias: '',
    orden: r.orden ?? '',
  };
  d.records.cxc.unshift(row);
  return row;
}

export function createPayable(d: DB, r: { doc: string; prov: string; ruc: string; total: number; vence: Date; orden?: string }): Row {
  const n = daysBetween(new Date(), r.vence);
  const row: Row = {
    _id: nextId(d.records.cxp),
    doc: r.doc,
    emision: fmtDate(new Date()),
    prov: r.prov,
    ruc: r.ruc,
    vence: fmtDate(r.vence),
    total: round2(r.total),
    saldo: round2(r.total),
    estado: n < 0 ? 'Vencida' : n <= 7 ? 'Vence esta semana' : 'Por vencer',
    dias: '',
    orden: r.orden ?? '',
  };
  d.records.cxp.unshift(row);
  return row;
}

/** Applies a customer payment to a receivable. Returns the remaining balance. */
export function collect(d: DB, row: Row, p: Payment): number {
  const amount = Math.min(round2(p.amount), Number(row.saldo));
  row.saldo = round2(Number(row.saldo) - amount);
  row.estado = row.saldo <= 0 ? 'Cobrada' : 'Cobro parcial';
  if (row.saldo <= 0) row.dias = 'cobrada ' + fmtDayMonth(new Date());
  moveMoney(d, amount, p, `Cobro ${row.doc} · ${row.cliente}`);
  audit(d, { action: 'Editar', module: 'Finanzas', ref: String(row.doc), desc: `Cobro registrado · ${formatMoney(amount)}`, changes: [['Saldo', formatMoney(Number(row.saldo) + amount), formatMoney(Number(row.saldo))], ['Estado', '', String(row.estado)]] });
  return Number(row.saldo);
}

/** Applies a payment to a supplier payable. Returns the remaining balance. */
export function pay(d: DB, row: Row, p: Payment): number {
  const amount = Math.min(round2(p.amount), Number(row.saldo));
  row.saldo = round2(Number(row.saldo) - amount);
  if (row.saldo <= 0) {
    row.estado = 'Pagada';
    row.dias = 'pagada ' + fmtDayMonth(new Date());
  }
  moveMoney(d, -amount, p, `Pago ${row.doc} · ${row.prov}`);
  audit(d, { action: 'Editar', module: 'Finanzas', ref: String(row.doc), desc: `Pago registrado · ${formatMoney(amount)}`, changes: [['Saldo', formatMoney(Number(row.saldo) + amount), formatMoney(Number(row.saldo))]] });
  return Number(row.saldo);
}

/** Days until due for a payment term like "Crédito 30 días" (0 for Contado). */
export function termDays(term: string): number {
  const m = /(\d+)/.exec(term);
  return m ? Number(m[1]) : 0;
}

export const dueFromTerm = (term: string, from = new Date()) => addDays(from, termDays(term));
