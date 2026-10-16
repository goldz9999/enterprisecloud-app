import { refreshSession } from './domain/auth';
import { loadAdmin } from './domain/admin';
import { loadMasters } from './domain/masters';
import { loadSaleOrders } from './domain/salesOrders';
import { loadQuotations } from './domain/quotations';
import { loadInvoices } from './domain/invoices';
import { loadPurchaseRequests } from './domain/purchaseRequests';
import { loadPurchaseOrders } from './domain/purchaseOrders';
import { loadGoodsReceipts } from './domain/goodsReceipts';
import { loadAdjustments, loadKardex, loadStock, loadTransfers } from './domain/inventory';
import { loadBankMovements, loadCash, loadPayables, loadReceivables } from './domain/finance';

/**
 * Datos por módulo. Al iniciar solo se descarga lo común (sesión, permisos, configuración y maestros);
 * lo de cada módulo se pide al entrar a su pantalla y, una vez cargado, se mantiene al día por tiempo real.
 */
export type Domain =
  | 'quotations' | 'sales' | 'invoices' | 'requests' | 'purchases' | 'receipts'
  | 'stock' | 'kardex' | 'transfers' | 'adjustments'
  | 'receivables' | 'payables' | 'cash' | 'bank';

const LOAD: Record<Domain, () => Promise<void>> = {
  quotations: loadQuotations,
  sales: loadSaleOrders,
  invoices: loadInvoices,
  requests: loadPurchaseRequests,
  purchases: loadPurchaseOrders,
  receipts: loadGoodsReceipts,
  stock: loadStock,
  kardex: loadKardex,
  transfers: loadTransfers,
  adjustments: loadAdjustments,
  receivables: loadReceivables,
  payables: loadPayables,
  cash: loadCash,
  bank: loadBankMovements,
};
export const ALL_DOMAINS = Object.keys(LOAD) as Domain[];

/** Qué necesita cada pantalla. Gana el prefijo más largo; una ruta desconocida carga todo (más lento pero correcto). */
const ROUTES: [prefix: string, needs: Domain[]][] = [
  ['/ventas/cotizaciones', ['quotations', 'stock']],
  ['/ventas/comprobantes', ['invoices', 'sales']],
  ['/ventas', ['sales', 'invoices', 'stock', 'receivables']],
  ['/compras/solicitudes', ['requests', 'purchases']],
  ['/compras', ['purchases', 'receipts']],
  ['/inventario/stock', ['stock']],
  ['/inventario/kardex', ['purchases', 'receipts']],
  ['/inventario/movimientos', ['kardex', 'stock']],
  ['/inventario/transferencias', ['transfers', 'stock']],
  ['/inventario/ajustes', ['adjustments', 'stock']],
  ['/finanzas/cxc', ['receivables', 'invoices', 'sales']],
  ['/finanzas/cxp', ['payables', 'purchases']],
  ['/finanzas/caja', ['cash']],
  ['/finanzas/bancos', ['bank']],
  ['/finanzas', ['receivables', 'payables', 'cash', 'bank']],
  // Mantenimiento valida «¿tiene movimientos?» antes de eliminar, así que necesita lo relacionado.
  ['/mantenimiento/clientes', ['sales', 'receivables']],
  ['/mantenimiento/proveedores', ['purchases', 'payables']],
  ['/mantenimiento/productos', ['stock', 'sales', 'purchases']],
  ['/mantenimiento/almacenes', ['stock']],
  ['/mantenimiento', []],
  ['/reportes', ALL_DOMAINS],
  ['/historial', ALL_DOMAINS], // reúne eventos de todos los módulos
  ['/documentos', []],
  ['/admin', []],
  ['/configuracion', []],
  ['/login', []],
];

export function domainsForPath(path: string): Domain[] {
  if (path === '/' || path === '') return []; // el Dashboard lee sus cifras del servidor
  let best: [string, Domain[]] | undefined;
  for (const r of ROUTES) {
    if ((path === r[0] || path.startsWith(r[0] + '/')) && (!best || r[0].length > best[0].length)) best = r;
  }
  return best ? best[1] : ALL_DOMAINS;
}

const loaded = new Set<Domain>();
export const isLoaded = (...ds: Domain[]) => ds.every(d => loaded.has(d));

/** Pide lo que falte de estos módulos (lo ya cargado no se vuelve a pedir). */
export function ensureLoaded(ds: Domain[]) {
  for (const d of ds) {
    if (loaded.has(d)) continue;
    loaded.add(d);
    void LOAD[d]();
  }
}

/** Relectura por aviso de tiempo real: solo de módulos que esta sesión ya cargó. */
export function reloadIfLoaded(ds: Domain[]) {
  for (const d of ds) if (loaded.has(d)) void LOAD[d]();
}

let bootedFor: string | undefined;
/** Carga inicial de la sesión: se hace una vez por token, aunque el efecto que la llama se ejecute dos veces. */
export function bootData(token: string | undefined, path: string) {
  if (!token) {
    bootedFor = undefined;
    loaded.clear();
    return;
  }
  if (bootedFor === token) return;
  bootedFor = token;
  loadAll(path);
}

/** Descarga lo común y lo de la pantalla actual. Se llama al iniciar sesión y desde "Reintentar". */
export function loadAll(path: string = window.location.pathname) {
  void refreshSession();
  // Mantenimiento, Administración y configuración se leen del backend (Supabase).
  void loadMasters();
  void loadAdmin();
  loaded.clear();
  ensureLoaded(domainsForPath(path));
}
