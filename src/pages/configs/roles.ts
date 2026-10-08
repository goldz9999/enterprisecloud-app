import { MODULES } from '../../data/permissions';
import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

export const roles: RecordsConfig = {
  active: 'Roles',
  title: 'Roles',
  subtitle: 'Perfiles de acceso que agrupan permisos. A cada usuario se le asigna un rol.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Roles' }],
  newLabel: 'Nuevo rol',
  crud: true, entity: 'Rol', titleKey: 'nombre', subKey: 'desc', statusKey: 'estado', newTitle: 'Nuevo rol', newKicker: 'Administración · Roles', msgNew: 'Rol creado · configura sus permisos', msgDel: 'Rol dado de baja',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['nombre', 'desc', 'usuarios', 'modulos', 'tipo', 'estado', 'base'],
  collection: 'roles',
  defaults: () => ({ usuarios: 0, tipo: 'Personalizado', modulos: '' }),
  view: (row, d) => {
    const perms = d.permisos[String(row.nombre)];
    const mods = perms ? Object.entries(perms).filter(([, p]) => p[0]).map(([m]) => m) : [];
    const total = MODULES.reduce((a, [, ms]) => a + ms.length, 0);
    return {
      ...row,
      usuarios: d.records.usuarios.filter(u => u.rol === row.nombre).length,
      modulos: row.nombre === 'Administrador' || mods.length === total ? 'Todos' : mods.length ? `${mods.length} módulos: ${mods.slice(0, 3).join(', ')}${mods.length > 3 ? '…' : ''}` : 'Sin acceso',
    };
  },
  onCreate: (d, row) => {
    if (d.records.roles.some(r => String(r.nombre).toLowerCase() === String(row.nombre).toLowerCase())) return `Ya existe el rol ${row.nombre}.`;
  },
  onUpdate: (_d, before, after) => {
    if (before.tipo === 'Sistema' && after.nombre !== before.nombre) return 'Los roles de tipo Sistema no se pueden renombrar.';
  },
  columns: [{ k: 'nombre', label: 'Rol', w: 'minmax(0, 1.2fr)', sub: 'desc' }, { k: 'usuarios', label: 'Usuarios', w: '80px', fmt: 'int', align: 'right' }, { k: 'modulos', label: 'Módulos con acceso', w: 'minmax(0, 1fr)', muted: true }, { k: 'tipo', label: 'Tipo', w: '110px', muted: true }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombre del rol', required: true }, { k: 'base', label: 'Copiar permisos de', only: 'new', type: 'select', options: d => ['— Ninguno —', ...opts.roles(d)] }, { k: 'desc', label: 'Descripción', wide: true }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'Define qué puede ver, crear, editar, eliminar y aprobar este rol en Administración › Permisos. Los roles no se eliminan: se dan de baja (Inactivo), salvo los de tipo Sistema.',
};