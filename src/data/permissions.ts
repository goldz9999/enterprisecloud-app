import { useDB } from './store';
import { currentUser } from './store';
import type { DB, PermMatrix } from './types';

export const ACTIONS = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar'] as const;
export type PermAction = (typeof ACTIONS)[number];

/** Permission modules, grouped as in the Permisos screen. Names match sidebar labels. */
export const MODULES: [group: string, modules: string[]][] = [
  ['Inicio', ['Dashboard']],
  ['Ventas', ['Cotizaciones', 'Órdenes de venta', 'Comprobantes']],
  ['Compras', ['Solicitudes', 'Órdenes de compra', 'Recepción']],
  ['Inventario', ['Stock por almacén', 'Kardex', 'Transferencias', 'Ajustes']],
  ['Finanzas', ['Cuentas por cobrar', 'Cuentas por pagar', 'Caja', 'Bancos']],
  ['Documentos y reportes', ['Documentos', 'Reportes']],
  ['Mantenimiento', ['Clientes', 'Proveedores', 'Productos', 'Categorías', 'Almacenes']],
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
  set('Gerente', (g, m) => (g === 'Sistema' ? (m === 'Configuración' ? NONE : VIEW) : FULL));
  set('Ventas', (g, m) => (g === 'Ventas' ? (m === 'Comprobantes' ? P(1, 1, 0, 0, 0) : WORK) : m === 'Clientes' ? WORK : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Documentos', 'Productos']) ? VIEW : NONE));
  set('Compras', (g, m) => (g === 'Compras' || m === 'Proveedores' ? WORK : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Kardex', 'Documentos', 'Productos', 'Cuentas por pagar']) ? VIEW : NONE));
  set('Almacén', (g, m) => (g === 'Inventario' || m === 'Recepción' ? WORK : m === 'Órdenes de venta' ? P(1, 0, 1, 0, 0) : m === 'Solicitudes' ? P(1, 1, 0, 0, 0) : isIn(m, ['Dashboard', 'Productos', 'Almacenes', 'Documentos']) ? VIEW : NONE));
  set('Contabilidad', (g, m) => (g === 'Finanzas' ? FULL : m === 'Comprobantes' ? P(1, 1, 1, 0, 1) : isIn(m, ['Dashboard', 'Reportes', 'Documentos', 'Clientes', 'Proveedores', 'Auditoría']) ? VIEW : NONE));
  return all;
}

/** Whether the signed-in user's role may perform `action` on `module`. Unknown modules are allowed. */
export function can(d: DB, module: string, action: PermAction = 'Ver'): boolean {
  const role = currentUser(d).role;
  if (role === 'Administrador') return true;
  const row = d.permisos[role]?.[module];
  if (!row) return !d.permisos[role]; // roles without a matrix (custom, never configured) see everything
  return row[ACTIONS.indexOf(action)];
}

export function useCan(module: string) {
  const d = useDB();
  return (action: PermAction = 'Ver') => can(d, module, action);
}
