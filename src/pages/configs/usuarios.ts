import { audit } from '../../data/domain/audit';
import { INITIAL_PASSWORD } from '../../data/domain/auth';
import { currentUser } from '../../data/store';
import { opts } from './shared';
import type { RecordsConfig } from '../../features/records/types';

const RESET = `Restablecer a ${INITIAL_PASSWORD}`;

export const usuarios: RecordsConfig = {
  active: 'Usuarios',
  title: 'Usuarios',
  subtitle: 'Cuentas de acceso al ERP. El rol asignado determina qué módulos y acciones puede usar cada persona.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Usuarios' }],
  newLabel: 'Invitar usuario',
  crud: true, entity: 'Usuario', titleKey: 'nombre', subKey: 'correo', statusKey: 'estado', newTitle: 'Invitar usuario', newKicker: 'Administración · Usuarios', msgNew: 'Invitación enviada por correo', msgDel: 'Usuario eliminado',
  statuses: { 'Activo': 'green', 'Sin confirmar': 'amber', 'Bloqueado': 'red', 'Inactivo': 'muted' },
  keys: ['nombre', 'correo', 'rol', 'area', 'acceso', 'mfa', 'estado'],
  collection: 'usuarios',
  defaults: () => ({ acceso: 'Nunca' }),
  onCreate: (d, row) => {
    if (d.records.usuarios.some(u => String(u.correo).toLowerCase() === String(row.correo).toLowerCase())) return `Ya existe un usuario con el correo ${row.correo}.`;
    delete row.reset;
  },
  onUpdate: (d, before, after) => {
    if (String(after.correo).toLowerCase() !== String(before.correo).toLowerCase() && d.records.usuarios.some(u => u !== before && String(u.correo).toLowerCase() === String(after.correo).toLowerCase())) return `Ya existe un usuario con el correo ${after.correo}.`;
    if (after.estado === 'Activo' && before.estado === 'Bloqueado') after.intentos = 0;
    if (after.reset === RESET) {
      delete after.password;
      after.intentos = 0;
      audit(d, { action: 'Editar', module: 'Seguridad', ref: String(after.correo), desc: `Contraseña restablecida a la inicial (${INITIAL_PASSWORD})` });
    }
    delete after.reset;
  },
  canDelete: (row, d) => {
    if (String(row.correo).toLowerCase() === currentUser(d).email.toLowerCase()) return 'No puedes eliminar tu propia cuenta.';
  },
  kpis: rows => [{ label: 'Usuarios activos', value: String(rows.filter(r => r.estado === 'Activo').length), note: 'de ' + rows.length + ' cuentas' }, { label: 'Sin confirmar', value: String(rows.filter(r => r.estado === 'Sin confirmar').length), note: 'invitaciones pendientes', tone: 'amber' }, { label: 'Bloqueados', value: String(rows.filter(r => r.estado === 'Bloqueado').length), note: 'por intentos fallidos', tone: 'red' }],
  columns: [{ k: 'nombre', label: 'Usuario', w: 'minmax(0, 1fr)', sub: 'correo' }, { k: 'rol', label: 'Rol', w: '120px' }, { k: 'area', label: 'Área', w: '110px', muted: true }, { k: 'acceso', label: 'Último acceso', w: '116px', mono: true, muted: true }, { k: 'estado', label: 'Estado', w: '120px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombres y apellidos', required: true, wide: true }, { k: 'correo', label: 'Correo corporativo', required: true, wide: true, placeholder: 'nombre@empresa.pe' }, { k: 'rol', label: 'Rol', type: 'select', options: opts.roles }, { k: 'area', label: 'Área', type: 'select', options: ['Comercial', 'Logística', 'Finanzas', 'Gerencia', 'Sistemas'] }, { k: 'mfa', label: 'Verificación en 2 pasos', type: 'select', options: ['Desactivado', 'Activado'] }, { k: 'estado', label: 'Estado', type: 'select', options: ['Sin confirmar', 'Activo', 'Bloqueado', 'Inactivo'] }, { k: 'reset', label: 'Contraseña', type: 'select', options: ['Mantener', RESET], value: 'Mantener' }],
  note: 'El usuario entra con su correo y la contraseña demo1234 hasta que defina la suya desde su menú de cuenta. Los permisos de cada rol se configuran en Administración › Permisos.',
};