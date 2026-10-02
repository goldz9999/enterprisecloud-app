import type { RecordsConfig } from '../../features/records/types';

export const usuarios: RecordsConfig = {
  active: 'Usuarios',
  title: 'Usuarios',
  subtitle: 'Cuentas de acceso al ERP. El rol asignado determina qué módulos y acciones puede usar cada persona.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Usuarios' }],
  newLabel: 'Invitar usuario',
  crud: true, entity: 'Usuario', titleKey: 'nombre', subKey: 'correo', statusKey: 'estado', newTitle: 'Invitar usuario', newKicker: 'Administración · Usuarios', msgNew: 'Invitación enviada por correo', msgDel: 'Usuario eliminado',
  statuses: { 'Activo': 'green', 'Sin confirmar': 'amber', 'Bloqueado': 'red', 'Inactivo': 'muted' },
  keys: ['nombre','correo','rol','area','acceso','mfa','estado'],
  defaults: () => ({ acceso: 'Nunca' }),
  kpis: rows => [{ label: 'Usuarios activos', value: String(rows.filter(r => r.estado === 'Activo').length), note: 'de ' + rows.length + ' cuentas' }, { label: 'Sin confirmar', value: String(rows.filter(r => r.estado === 'Sin confirmar').length), note: 'invitaciones pendientes', tone: 'amber' }, { label: 'Bloqueados', value: String(rows.filter(r => r.estado === 'Bloqueado').length), note: 'por intentos fallidos', tone: 'red' }],
  columns: [{ k: 'nombre', label: 'Usuario', w: 'minmax(0, 1fr)', sub: 'correo' }, { k: 'rol', label: 'Rol', w: '120px' }, { k: 'area', label: 'Área', w: '110px', muted: true }, { k: 'acceso', label: 'Último acceso', w: '116px', mono: true, muted: true }, { k: 'estado', label: 'Estado', w: '120px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombres y apellidos', required: true, wide: true }, { k: 'correo', label: 'Correo corporativo', required: true, wide: true, placeholder: 'nombre@empresa.pe' }, { k: 'rol', label: 'Rol', type: 'select', options: ['Ventas', 'Compras', 'Almacén', 'Contabilidad', 'Gerente', 'Administrador'] }, { k: 'area', label: 'Área', type: 'select', options: ['Comercial', 'Logística', 'Finanzas', 'Gerencia', 'Sistemas'] }, { k: 'mfa', label: 'Verificación en 2 pasos', type: 'select', options: ['Desactivado', 'Activado'] }, { k: 'estado', label: 'Estado', type: 'select', options: ['Sin confirmar', 'Activo', 'Bloqueado', 'Inactivo'] }],
  note: 'Al invitar, el usuario recibe un correo para crear su contraseña. Los permisos de cada rol se configuran en Administración › Permisos.',
  rows: [
    ['María Rojas','maria.rojas@empresa.pe','Gerente','Gerencia','Hoy 10:42','Activado','Activo'],
    ['Luis Paredes','luis.paredes@empresa.pe','Ventas','Comercial','Hoy 09:58','Activado','Activo'],
    ['Rosa Medina','rosa.medina@empresa.pe','Contabilidad','Finanzas','Hoy 09:31','Activado','Activo'],
    ['Ana Torres','ana.torres@empresa.pe','Compras','Logística','Ayer 18:04','Desactivado','Activo'],
    ['Carlos Huamán','carlos.huaman@empresa.pe','Almacén','Logística','Hoy 08:12','Desactivado','Activo'],
    ['Jorge Quispe','jorge.quispe@empresa.pe','Almacén','Logística','Nunca','Desactivado','Sin confirmar'],
    ['Administrador del sistema','admin@empresa.pe','Administrador','Sistemas','30 sep 21:14','Activado','Bloqueado'],
    ['Pedro Gómez','pedro.gomez@empresa.pe','Ventas','Comercial','12 ago 2026','Desactivado','Inactivo'],
  ],
};
