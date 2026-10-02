import type { RecordsConfig } from '../../features/records/types';

export const roles: RecordsConfig = {
  active: 'Roles',
  title: 'Roles',
  subtitle: 'Perfiles de acceso que agrupan permisos. A cada usuario se le asigna un rol.',
  breadcrumb: [{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Roles' }],
  newLabel: 'Nuevo rol',
  crud: true, entity: 'Rol', titleKey: 'nombre', subKey: 'desc', statusKey: 'estado', newTitle: 'Nuevo rol', newKicker: 'Administración · Roles', msgNew: 'Rol creado · configura sus permisos', msgDel: 'Rol eliminado',
  statuses: { 'Activo': 'green', 'Inactivo': 'muted' },
  keys: ['nombre','desc','usuarios','modulos','tipo','estado','base'],
  defaults: () => ({ usuarios: 0, tipo: 'Personalizado', modulos: 'Según rol base' }),
  columns: [{ k: 'nombre', label: 'Rol', w: 'minmax(0, 1.2fr)', sub: 'desc' }, { k: 'usuarios', label: 'Usuarios', w: '80px', fmt: 'int', align: 'right' }, { k: 'modulos', label: 'Módulos con acceso', w: 'minmax(0, 1fr)', muted: true }, { k: 'tipo', label: 'Tipo', w: '110px', muted: true }, { k: 'estado', label: 'Estado', w: '96px', chip: true }],
  fields: [{ k: 'nombre', label: 'Nombre del rol', required: true }, { k: 'base', label: 'Copiar permisos de', type: 'select', options: ['— Ninguno —', 'Ventas', 'Compras', 'Almacén', 'Contabilidad', 'Gerente'] }, { k: 'desc', label: 'Descripción', wide: true }, { k: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }],
  note: 'Define qué puede ver, crear, editar, eliminar y aprobar este rol en Administración › Permisos. Los roles de tipo Sistema no se pueden eliminar.',
  rows: [
    ['Administrador','Acceso total y configuración del sistema',1,'Todos','Sistema','Activo','—'],
    ['Gerente','Aprueba compras, descuentos y anulaciones',1,'Todos excepto Configuración','Sistema','Activo','—'],
    ['Ventas','Cotizaciones, órdenes de venta y clientes',2,'Ventas, Clientes, Reportes','Personalizado','Activo','—'],
    ['Compras','Solicitudes, órdenes de compra y proveedores',1,'Compras, Proveedores, Inventario (ver)','Personalizado','Activo','—'],
    ['Almacén','Despachos, recepciones, transferencias y ajustes',2,'Inventario, Recepción, Despacho','Personalizado','Activo','—'],
    ['Contabilidad','Comprobantes, cuentas por cobrar y pagar, caja y bancos',1,'Finanzas, Comprobantes, Reportes','Personalizado','Activo','—'],
  ],
};
