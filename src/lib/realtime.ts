import { useSyncExternalStore } from 'react';
import { loadAdmin } from '../data/domain/admin';
import { refreshSession } from '../data/domain/auth';
import { loadMasters } from '../data/domain/masters';
import { loadFinance, loadPayables, loadReceivables } from '../data/domain/finance';
import { loadGoodsReceipts } from '../data/domain/goodsReceipts';
import { loadInventory, loadKardex, loadStock } from '../data/domain/inventory';
import { loadInvoices } from '../data/domain/invoices';
import { loadPurchaseOrders } from '../data/domain/purchaseOrders';
import { loadPurchaseRequests } from '../data/domain/purchaseRequests';
import { loadQuotations } from '../data/domain/quotations';
import { loadSaleOrders } from '../data/domain/salesOrders';
import { API_URL } from './api';
import { CLIENT_ID } from './clientId';

/**
 * Actualización automática: el backend avisa por WebSocket cuando otra persona guarda algo, y aquí se vuelve a
 * leer solo lo que cambió. El aviso no trae datos; las lecturas siguen siendo las de siempre (con sus permisos).
 */

const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';
const PING_MS = 25_000;
const DEBOUNCE_MS = 700;
const MAX_WAIT_MS = 5_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

// ── Contador de avisos: las pantallas que piden sus propios datos (Dashboard, Auditoría) lo usan para releer ──
let tick = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** Cambia cada vez que llega un cambio de otra persona (o se recupera la conexión). */
export const useRealtimeTick = () => useSyncExternalStore(subscribe, () => tick);

// ── Qué releer según el recurso que cambió (lo mínimo: el límite del servidor es de 120 peticiones por minuto por IP) ──
const ADMIN = new Set(['users', 'roles', 'permissions', 'settings']);
const TREASURY = new Set(['receivables', 'payables', 'cash', 'bank-movements', 'bank-accounts', 'treasury-movements']);
const STOCK = new Set(['stock', 'kardex', 'transfers', 'adjustments']);

type Job = 'session' | 'admin' | 'masters' | 'quotations' | 'requests' | 'sales' | 'purchases' | 'invoices' | 'receipts' | 'stock' | 'kardex' | 'receivables' | 'payables' | 'treasury' | 'inventory';
const jobsFor = (resource: string): Job[] => {
  if (resource === 'documents' || resource === 'audit' || resource === 'dashboard') return [];
  if (resource === 'settings') return ['admin'];
  if (ADMIN.has(resource)) return ['admin', 'session'];
  if (TREASURY.has(resource)) return ['treasury'];
  if (STOCK.has(resource)) return ['inventory'];
  switch (resource) {
    case 'quotations': return ['quotations'];
    case 'purchase-requests': return ['requests', 'purchases'];
    // Un paso de la orden mueve otras cosas: despachar baja stock, facturar crea la cuenta por cobrar, recibir cambia el costo promedio.
    case 'sales-orders': return ['sales', 'invoices', 'stock', 'kardex', 'receivables'];
    case 'sales-invoices': return ['invoices', 'receivables'];
    case 'purchase-orders': return ['purchases', 'receipts', 'stock', 'kardex', 'payables', 'masters'];
    case 'goods-receipts': return ['receipts', 'stock', 'kardex'];
    default: return ['masters']; // clientes, proveedores, productos, almacenes, categorías…
  }
};

const RUN: Record<Job, () => void> = {
  session: () => void refreshSession(),
  admin: () => void loadAdmin(),
  masters: () => void loadMasters(),
  quotations: () => void loadQuotations(),
  requests: () => void loadPurchaseRequests(),
  sales: () => void loadSaleOrders(),
  purchases: () => void loadPurchaseOrders(),
  invoices: () => void loadInvoices(),
  receipts: () => void loadGoodsReceipts(),
  stock: () => void loadStock(),
  kardex: () => void loadKardex(),
  receivables: () => void loadReceivables(),
  payables: () => void loadPayables(),
  treasury: () => void loadFinance(),
  inventory: () => void loadInventory(),
};
const ALL_JOBS = Object.keys(RUN) as Job[];

let pending = new Set<Job>();
let timer: ReturnType<typeof setTimeout> | undefined;
let firstPendingAt = 0;
const flush = () => {
  clearTimeout(timer);
  timer = undefined;
  firstPendingAt = 0;
  const todo = pending;
  pending = new Set();
  // Si 'inventory' ya relee stock y kardex, no se piden dos veces.
  if (todo.has('inventory')) { todo.delete('stock'); todo.delete('kardex'); }
  if (todo.has('treasury')) { todo.delete('receivables'); todo.delete('payables'); }
  todo.forEach(j => RUN[j]());
};
const schedule = (jobs: Job[]) => {
  tick++;
  listeners.forEach(fn => fn());
  if (!jobs.length) return;
  jobs.forEach(j => pending.add(j));
  firstPendingAt ||= Date.now();
  clearTimeout(timer);
  // Varios avisos seguidos se agrupan en una sola relectura; con avisos continuos se relee como mucho cada MAX_WAIT_MS.
  timer = setTimeout(flush, Date.now() - firstPendingAt > MAX_WAIT_MS ? 0 : DEBOUNCE_MS);
};

// ── Conexión ──
let socket: WebSocket | undefined;
let currentToken: string | undefined;
let retry = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let wasConnected = false;

function connect() {
  if (!currentToken || typeof WebSocket === 'undefined') return;
  const token = currentToken;
  const ws = new WebSocket(WS_URL);
  socket = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    let msg: { type?: string; resource?: string; by?: string | null };
    try { msg = JSON.parse(String(e.data)); } catch { return; }
    if (msg.type === 'ready') {
      retry = 0;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
      // Tras una reconexión pudo haberse perdido algún aviso: se relee todo una vez.
      if (wasConnected) schedule(ALL_JOBS);
      wasConnected = true;
    } else if (msg.type === 'changed' && msg.by !== CLIENT_ID) {
      schedule(jobsFor(String(msg.resource ?? '')));
    }
  };
  ws.onclose = e => {
    clearInterval(pingTimer);
    if (socket === ws) socket = undefined;
    // 4401: el token no vale (la sesión se maneja en api.ts); 4403: origen no permitido. En ambos casos no se insiste.
    if (token !== currentToken || e.code === 4401 || e.code === 4403) return;
    reconnectTimer = setTimeout(connect, BACKOFF_MS[Math.min(retry++, BACKOFF_MS.length - 1)]);
  };
  ws.onerror = () => ws.close();
}

/** Abre (o reabre) el canal para esta sesión. Sin token lo cierra. */
export function startRealtime(token: string | undefined) {
  if (token === currentToken && (socket || reconnectTimer)) return;
  stopRealtime();
  currentToken = token;
  if (token) connect();
}

export function stopRealtime() {
  currentToken = undefined;
  wasConnected = false;
  retry = 0;
  clearTimeout(reconnectTimer);
  clearTimeout(timer);
  timer = undefined;
  firstPendingAt = 0;
  clearInterval(pingTimer);
  reconnectTimer = undefined;
  pending = new Set();
  const ws = socket;
  socket = undefined;
  ws?.close();
}
