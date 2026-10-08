import { api, ApiError } from '../../lib/api';
import { addDays } from '../../lib/dates';
import { update } from '../store';
import type { DB, Row } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function explain(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return e.message;
    if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
    if (e.status === 404) return 'El registro ya no existe.';
    return e.message.replace(/Value error, /g, '');
  }
  return 'Ocurrió un error inesperado.';
}

const maps = {
  cxc: new Map<string, number>(),
  cxp: new Map<string, number>(),
  caja: new Map<string, number>(),
  bancos: new Map<string, number>(),
};
let seq = 0;
function lid(map: Map<string, number>, key: string): number {
  let n = map.get(key);
  if (!n) {
    n = ++seq;
    map.set(key, n);
  }
  return n;
}

export type FinResult = { ok: true } | { ok: false; error: string };

/** Cuentas bancarias conocidas (desde movimientos cargados). */
export function bankAccounts(d: DB): string[] {
  return [...new Set(d.records.bancos.map(b => String(b.cuenta)).filter(Boolean))];
}

export function bankBalance(d: DB, account: string): number {
  return d.records.bancos.filter(b => b.cuenta === account).reduce((a, b) => a + Number(b.monto), 0);
}

// ---- CxC ----
function cxcRow(r: Raw): Row {
  return {
    _id: lid(maps.cxc, String(r.id)),
    doc: String(r.doc || ''),
    emision: String(r.emision || ''),
    cliente: String(r.cliente || ''),
    ruc: String(r.ruc || ''),
    vence: String(r.vence || ''),
    total: Number(r.total) || 0,
    saldo: Number(r.saldo) || 0,
    estado: String(r.estado || 'Por vencer'),
    dias: String(r.dias || ''),
    orden: String(r.orden || ''),
    uuid: String(r.id || ''),
  };
}

export async function loadReceivables(): Promise<void> {
  try {
    const res = await api<{ items: Raw[] }>('/receivables?limit=200');
    update(d => {
      d.records.cxc = (res.items || []).map(cxcRow);
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      update(d => {
        d.records.cxc = [];
      });
    }
  }
}

export async function collectRemote(
  id: string,
  amount: number,
  channel: string,
  reference?: string,
): Promise<FinResult> {
  try {
    await api(`/receivables/${encodeURIComponent(id)}/collect`, {
      method: 'POST',
      body: {
        amount,
        channel: channel === 'Bancos' || channel === 'BANK' ? 'BANK' : 'CASH',
        reference,
      },
    });
    await loadReceivables();
    await loadCash();
    await loadBankMovements();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

// ---- CxP ----
function cxpRow(r: Raw): Row {
  return {
    _id: lid(maps.cxp, String(r.id)),
    doc: String(r.doc || ''),
    emision: String(r.emision || ''),
    prov: String(r.prov || ''),
    ruc: String(r.ruc || ''),
    vence: String(r.vence || ''),
    total: Number(r.total) || 0,
    saldo: Number(r.saldo) || 0,
    estado: String(r.estado || 'Por vencer'),
    dias: String(r.dias || ''),
    orden: String(r.orden || ''),
    uuid: String(r.id || ''),
  };
}

export async function loadPayables(): Promise<void> {
  try {
    const res = await api<{ items: Raw[] }>('/payables?limit=200');
    update(d => {
      d.records.cxp = (res.items || []).map(cxpRow);
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      update(d => {
        d.records.cxp = [];
      });
    }
  }
}

export async function payRemote(
  id: string,
  amount: number,
  channel: string,
  reference?: string,
): Promise<FinResult> {
  try {
    await api(`/payables/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      body: {
        amount,
        channel: channel === 'Caja' || channel === 'CASH' ? 'CASH' : 'BANK',
        reference,
      },
    });
    await loadPayables();
    await loadCash();
    await loadBankMovements();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

// ---- Caja ----
function cajaRow(r: Raw): Row {
  return {
    _id: lid(maps.caja, String(r.id || r.code)),
    fecha: String(r.fecha || ''),
    tipo: String(r.tipo || ''),
    desc: String(r.desc || ''),
    ref: String(r.ref || ''),
    monto: Number(r.monto) || 0,
    estado: String(r.estado || 'Conciliado'),
    uuid: String(r.id || ''),
  };
}

export async function loadCash(): Promise<void> {
  try {
    const res = await api<{ items: Raw[] }>('/cash?limit=200');
    update(d => {
      d.records.caja = (res.items || []).map(cajaRow);
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      update(d => {
        d.records.caja = [];
      });
    }
  }
}

export async function createCashRemote(values: {
  tipo: string;
  monto: number;
  desc: string;
  ref?: string;
}): Promise<FinResult> {
  try {
    await api('/cash', {
      method: 'POST',
      body: {
        amount: Math.abs(Number(values.monto)),
        tipo: values.tipo,
        description: values.desc,
        reference: values.ref || null,
      },
    });
    await loadCash();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

// ---- Bancos ----
function bancoRow(r: Raw): Row {
  return {
    _id: lid(maps.bancos, String(r.id || r.code)),
    fecha: String(r.fecha || ''),
    desc: String(r.desc || ''),
    cuenta: String(r.cuenta || ''),
    ref: String(r.ref || ''),
    monto: Number(r.monto) || 0,
    estado: String(r.estado || 'Pendiente'),
    uuid: String(r.id || ''),
  };
}

export async function loadBankMovements(): Promise<void> {
  try {
    const res = await api<{ items: Raw[] }>('/bank-movements?limit=200');
    update(d => {
      d.records.bancos = (res.items || []).map(bancoRow);
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      update(d => {
        d.records.bancos = [];
      });
    }
  }
}

export async function createBankRemote(values: {
  tipo: string;
  monto: number;
  desc: string;
  cuenta: string;
  ref?: string;
}): Promise<FinResult> {
  try {
    await api('/bank-movements', {
      method: 'POST',
      body: {
        amount: Math.abs(Number(values.monto)),
        tipo: values.tipo,
        description: values.desc,
        cuenta: values.cuenta,
        reference: values.ref || null,
      },
    });
    await loadBankMovements();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function reconcileRemote(id: string, reference?: string): Promise<FinResult> {
  try {
    await api(`/treasury-movements/${encodeURIComponent(id)}/reconcile`, {
      method: 'POST',
      body: { reference: reference || null },
    });
    await loadBankMovements();
    await loadCash();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

let pendingFinance: Promise<void> | null = null;

/** Si ya hay una carga en curso, la reutiliza (evita pedir lo mismo dos veces). */
export function loadFinance(): Promise<void> {
  pendingFinance ??= Promise.all([loadReceivables(), loadPayables(), loadCash(), loadBankMovements()])
    .then(() => undefined)
    .finally(() => { pendingFinance = null; });
  return pendingFinance;
}

// ---- Helpers puros de plazos de pago (usados por orders.ts) ----

/** "Contado" -> 0, "Crédito 30 días" -> 30. */
export function termDays(terms: string | undefined): number {
  const m = /(\d+)/.exec(terms || '');
  return m ? Number(m[1]) : 0;
}

export function dueFromTerm(terms: string | undefined): Date {
  return addDays(new Date(), termDays(terms));
}

// ---- Vistas para métricas/alertas (el backend ya calcula estado y días) ----

export const receivableView = (r: Row): Row => r;

/** El backend devuelve "Cobrada" al saldar; en cuentas por pagar se muestra "Pagada". */
export const payableView = (r: Row): Row => (r.estado === 'Cobrada' ? { ...r, estado: 'Pagada' } : r);