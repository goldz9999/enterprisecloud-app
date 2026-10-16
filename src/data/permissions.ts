import { getSession, useSession } from './session';
import type { DB, PermMatrix } from './types';

export const ACTIONS = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar'] as const;
export type PermAction = (typeof ACTIONS)[number];

/** Permission modules, grouped as in the Permisos screen. Names match sidebar labels. */
export const MODULES: [group: string, modules: string[]][] = [
  ['Inicio', ['Dashboard']],
  ['Ventas', ['Cotizaciones', 'Órdenes de venta', 'Comprobantes']],
  ['Compras', ['Órdenes de compra']],
  // «Kardex» es la recepción de mercadería (permiso goods-receipts); «Movimientos Kardex» es el registro de movimientos (kardex).
  ['Inventario', ['Stock por almacén', 'Kardex', 'Movimientos Kardex', 'Transferencias', 'Ajustes']],
  ['Finanzas', ['Cuentas por cobrar', 'Cuentas por pagar', 'Caja', 'Bancos']],
  ['Documentos y reportes', ['Documentos', 'Reportes']],
  ['Mantenimiento', ['Clientes', 'Proveedores', 'Productos', 'Categorías', 'Almacenes', 'Conductores', 'Vehículos']],
  ['Sistema', ['Usuarios', 'Roles', 'Permisos', 'Auditoría', 'Configuración']],
];

const P = (...flags: number[]) => flags.map(Boolean);
const FULL = P(1, 1, 1, 1, 1), VIEW = P(1, 0, 0, 0, 0), WORK = P(1, 1, 1, 0, 0), NONE = P(0, 0, 0, 0, 0);

export function defaultPermissions(): PermMatrix {
  const all: PermMatrix = {};
  const set = (role: string, fn: (group: string, mod: string) => boolean[]) => {
    all[role] = {};
    for (const [g, ms] of MODULES) for (const m of ms) all[role][m] = fn(g, m).slice();
  };
  const isIn = (m: string, list: string[]) => list.includes(m);
  set('Administrador', () => FULL);
  set('Gerente', g => (g === 'Sistema' ? VIEW : FULL));
  set('Ventas', (g, m) => (g === 'Ventas' ? (m === 'Comprobantes' ? P(1, 1, 0, 0, 0) : WORK) : m === 'Clientes' ? WORK : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Documentos', 'Productos']) ? VIEW : NONE));
  set('Compras', (g, m) => (g === 'Compras' || m === 'Proveedores' ? WORK : m === 'Kardex' ? P(1, 1, 1, 0, 1) : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Movimientos Kardex', 'Documentos', 'Productos', 'Cuentas por pagar']) ? VIEW : NONE));
  set('Almacén', (g, m) => (g === 'Inventario' ? (m === 'Kardex' ? P(1, 1, 1, 0, 1) : WORK) : m === 'Órdenes de venta' ? P(1, 0, 1, 0, 0) : m === 'Solicitudes' ? P(1, 1, 0, 0, 0) : isIn(m, ['Dashboard', 'Productos', 'Almacenes', 'Documentos']) ? VIEW : NONE));
  set('Contabilidad', (g, m) => (g === 'Finanzas' ? FULL : m === 'Comprobantes' ? P(1, 1, 1, 0, 1) : isIn(m, ['Dashboard', 'Reportes', 'Documentos', 'Clientes', 'Proveedores', 'Auditoría']) ? VIEW : NONE));
  return all;
}

/** Screen label → module key used by the backend (app/security/catalog.py). */
export const MODULE_KEYS: Record<string, string> = {
  Dashboard: 'dashboard',
  Cotizaciones: 'quotations', 'Órdenes de venta': 'sales-orders', Comprobantes: 'receipts',
  Solicitudes: 'purchase-requests', 'Órdenes de compra': 'purchase-orders',
  'Stock por almacén': 'stock', Kardex: 'goods-receipts', 'Movimientos Kardex': 'kardex', Transferencias: 'transfers', Ajustes: 'adjustments',
  'Cuentas por cobrar': 'receivables', 'Cuentas por pagar': 'payables', Caja: 'cash', Bancos: 'banks',
  Documentos: 'documents', Reportes: 'reports',
  Clientes: 'customers', Proveedores: 'suppliers', Productos: 'products', Categorías: 'categories',
  Almacenes: 'warehouses', Conductores: 'drivers', Vehículos: 'vehicles',
  Usuarios: 'users', Roles: 'roles', Permisos: 'permissions', Auditoría: 'audit', Configuración: 'settings',
};

/** Pantallas que no son un módulo propio y se rigen por el permiso de otro. «Historial» consolida eventos del servidor: pide ver Auditoría. */
const MODULE_ALIAS: Record<string, string> = { Historial: 'Auditoría' };

const ACTION_KEYS: Record<PermAction, string> = { Ver: 'view', Crear: 'create', Editar: 'edit', Eliminar: 'delete', Aprobar: 'approve' };

/** Whether the signed-in user's role may perform `action` on `module`, according to the permissions the backend sent at login. */
export function can(_d: DB | undefined, module: string, action: PermAction = 'Ver'): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.user.role.code === 'ADMIN') return true;
  const key = MODULE_KEYS[MODULE_ALIAS[module] ?? module];
  if (!key) return true; // modules without a backend key are not restricted
  return session.permissions[key]?.includes(ACTION_KEYS[action]) ?? false;
}

export function useCan(module: string) {
  useSession(); // re-render when permissions are refreshed
  return (action: PermAction = 'Ver') => can(undefined, module, action);
}