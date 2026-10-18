import { masterUserNames } from '@/data/domain/masters';
import { warehouses } from '@/data/domain/orders';
import type { DB } from '@/data/types';
import { fmtDate } from '@/shared/lib/dates';

/**
 * Sugerencias para un campo de texto libre: lo que ya se usó en esa colección más unos valores de ejemplo.
 * No limita lo que se puede escribir; cada negocio agrega sus propios valores.
 */
export const suggest = (collection: keyof DB['records'], key: string, examples: string[] = []) => (d: DB): string[] => {
  const used = (d.records[collection] as { [k: string]: unknown }[]).map(r => String(r[key] ?? '').trim()).filter(Boolean);
  return [...new Set([...used, ...examples])].sort((a, b) => a.localeCompare(b, 'es'));
};

/** Option lists computed from the current data, for selects in record forms. */
export const opts = {
  warehouses,
  activeUsers: (d: DB) => {
    const u = d.records.usuarios.filter(x => x.estado === 'Activo').map(x => String(x.nombre));
    return u.length ? u : ['—'];
  },
  /** Usuarios reales del backend (para vendedor / responsable), con '—' para dejarlo sin asignar. */
  masterUsers: () => masterUserNames(),
  usersWithRole: (role: string) => (d: DB) => {
    const u = d.records.usuarios.filter(x => x.rol === role && x.estado !== 'Inactivo').map(x => String(x.nombre));
    return u.length ? u : opts.activeUsers(d);
  },
  products: (d: DB) => d.records.productos.filter(p => p.estado !== 'Inactivo').map(p => String(p.nombre)),
  categories: (d: DB) => d.records.categorias.filter(c => c.estado !== 'Inactivo').map(c => String(c.nombre)),
  suppliers: (d: DB) => d.records.proveedores.filter(p => p.estado !== 'Inactivo').map(p => String(p.razon)),
  roles: (d: DB) => d.records.roles.filter(r => r.estado !== 'Inactivo').map(r => String(r.nombre)),
};

export const todayLabel = () => fmtDate(new Date());
export const thisYear = () => new Date().getFullYear();