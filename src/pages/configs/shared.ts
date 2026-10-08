import { masterUserNames } from '../../data/domain/masters';
import { warehouses } from '../../data/domain/orders';
import type { DB } from '../../data/types';
import { fmtDate } from '../../lib/dates';

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