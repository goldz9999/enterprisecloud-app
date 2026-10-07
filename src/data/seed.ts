import { defaultPermissions } from './permissions';
import { DEFAULT_SETTINGS } from './settings';
import type { DB, RecordCollection, Row } from './types';
import { RECORD_COLLECTIONS } from './types';

/** Roles base del sistema (los mismos que crea el backend). No son datos de ejemplo: el sistema los necesita. */
const DEFAULT_ROLES: Omit<Row, '_id'>[] = [
  { nombre: 'Administrador', desc: 'Acceso total y configuración del sistema', usuarios: 0, modulos: 'Todos', tipo: 'Sistema', estado: 'Activo', base: '—' },
  { nombre: 'Gerente', desc: 'Aprueba compras, descuentos y anulaciones', usuarios: 0, modulos: 'Todos excepto Configuración', tipo: 'Sistema', estado: 'Activo', base: '—' },
  { nombre: 'Ventas', desc: 'Cotizaciones, órdenes de venta y clientes', usuarios: 0, modulos: 'Ventas, Clientes, Reportes', tipo: 'Personalizado', estado: 'Activo', base: '—' },
  { nombre: 'Compras', desc: 'Solicitudes, órdenes de compra y proveedores', usuarios: 0, modulos: 'Compras, Proveedores, Inventario (ver)', tipo: 'Personalizado', estado: 'Activo', base: '—' },
  { nombre: 'Almacén', desc: 'Despachos, recepciones, transferencias y ajustes', usuarios: 0, modulos: 'Inventario, Recepción, Despacho', tipo: 'Personalizado', estado: 'Activo', base: '—' },
  { nombre: 'Contabilidad', desc: 'Comprobantes, cuentas por cobrar y pagar, caja y bancos', usuarios: 0, modulos: 'Finanzas, Comprobantes, Reportes', tipo: 'Personalizado', estado: 'Activo', base: '—' },
];

const defaultRoles = (): Row[] => DEFAULT_ROLES.map((r, i) => ({ _id: i + 1, ...r }) as Row);

/** Base de datos vacía: sin clientes, productos, ventas ni ningún otro registro. */
export function buildEmptyDB(keep?: Partial<Pick<DB, 'settings' | 'permisos'>> & { roles?: Row[] }): DB {
  const records = Object.fromEntries(RECORD_COLLECTIONS.map((k: RecordCollection) => [k, []])) as unknown as DB['records'];
  records.roles = keep?.roles ?? defaultRoles();
  return {
    version: 1,
    records,
    cotizaciones: [],
    solicitudes: [],
    orders: [],
    documentos: [],
    audit: [],
    permisos: keep?.permisos ?? defaultPermissions(),
    settings: keep?.settings ?? { ...DEFAULT_SETTINGS },
    alertsRead: [],
    counters: {},
    reportSchedules: [],
  };
}