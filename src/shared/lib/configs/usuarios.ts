import { opts, suggest } from '@/shared/lib/config-utils';
import type { RecordsConfig } from '@/shared/components/records/types';

export const usuarios: RecordsConfig = {
  active: 'Usuarios',
  title: 'Usuarios',
  subtitle: 'Cuentas de acceso al ERP. El rol asignado determina qué módulos y acciones puede usar cada persona.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Usuarios' }],
  newLabel: 'Nuevo usuario',
  crud: true, entity: 'Usuario', titleKey: 'nombre', subKey: 'correo', statusKey: 'estado', newTitle: 'Nuevo usuario', newKicker: 'Administración · Usuarios', msgNew: 'Usuario creado', msgDel: 'Usuario dado de baja',
  statuses: { 'Activo': 'green', 'Sin confirmar': 'amber', 'Bloqueado': 'red', 'Inactivo': 'muted' },
  keys: ['nombre', 'correo', 'rol', 'area', 'acceso', 'mfa', 'estado'],
  collection: 'usuarios',
  kpis: rows => [{ label: 'Usuarios activos', value: String(rows.filter(r => r.estado === 'Activo').length), note: 'de ' + rows.length + ' cuentas' }, { label: 'Sin confirmar', value: String(rows.filter(r => r.estado === 'Sin confirmar').length), note: 'aún no inician sesión', tone: 'amber' }, { label: 'Bloqueados', value: String(rows.filter(r => r.estado === 'Bloqueado').length), note: 'por intentos fallidos', tone: 'red' }],
  columns: [{ k: 'nombre', label: 'Usuario', w: 'minmax(0, 1fr)', sub: 'correo' }, { k: 'rol', label: 'Rol', w: '120px' }, { k: 'area', label: 'Área', w: '110px', muted: true }, { k: 'acceso', label: 'Último acceso', w: '116px', mono: true, muted: true }, { k: 'estado', label: 'Estado', w: '120px', chip: true }],
  fields: [
    { k: 'nombre', label: 'Nombres y apellidos', required: true, wide: true },
    { k: 'correo', label: 'Correo corporativo', required: true, wide: true, placeholder: 'nombre@empresa.pe' },
    { k: 'rol', label: 'Rol', type: 'select', options: opts.roles },
    { k: 'area', label: 'Área', placeholder: 'Ej. Comercial', suggestions: suggest('usuarios', 'area', ['Comercial', 'Logística', 'Finanzas', 'Gerencia', 'Sistemas']) },
    { k: 'estado', label: 'Estado', type: 'select', options: ['Sin confirmar', 'Activo', 'Bloqueado', 'Inactivo'] },
    { k: 'clave', label: 'Contraseña inicial', type: 'password', required: true, only: 'new', wide: true, placeholder: 'Mínimo 8 caracteres' },
    { k: 'reset', label: 'Nueva contraseña (opcional)', type: 'password', only: 'edit', wide: true, placeholder: 'Déjala vacía para no cambiarla' },
  ],
  note: 'El usuario entra con su correo y la contraseña inicial que definas aquí. Un usuario "Sin confirmar" pasa a Activo al iniciar sesión por primera vez. Las cuentas no se eliminan: se dan de baja (Inactivo) para conservar la auditoría. Los permisos de cada rol se configuran en Administración › Permisos.',
};