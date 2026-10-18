import type { RecordsConfig } from '@/shared/components/records/types';
import { ajustes } from './ajustes';
import { almacenes } from './almacenes';
import { bancos } from './bancos';
import { caja } from './caja';
import { categorias } from './categorias';
import { clientes } from './clientes';
import { comprobantes } from './comprobantes';
import { cuentasPorCobrar } from './cuentasPorCobrar';
import { cuentasPorPagar } from './cuentasPorPagar';
import { kardex } from './kardex';
import { preciosProveedor } from './preciosProveedor';
import { productos } from './productos';
import { proveedores } from './proveedores';
import { roles } from './roles';
import { conductores } from './conductores';
import { vehiculos } from './vehiculos';
import { stock } from './stock';
import { transferencias } from './transferencias';
import { usuarios } from './usuarios';

/** Route → config for every screen rendered by the generic RecordsPage. */
export const RECORD_PAGES: Record<string, RecordsConfig> = {
  '/ventas/comprobantes': comprobantes,
  '/inventario/stock': stock,
  '/inventario/movimientos': kardex,
  '/inventario/transferencias': transferencias,
  '/inventario/ajustes': ajustes,
  '/finanzas/cxc': cuentasPorCobrar,
  '/finanzas/cxp': cuentasPorPagar,
  '/finanzas/caja': caja,
  '/finanzas/bancos': bancos,
  '/mantenimiento/clientes': clientes,
  '/mantenimiento/proveedores': proveedores,
  '/mantenimiento/productos': productos,
  '/mantenimiento/proveedores/precios': preciosProveedor,
  '/mantenimiento/categorias': categorias,
  '/mantenimiento/almacenes': almacenes,
  '/mantenimiento/conductores': conductores,
  '/mantenimiento/vehiculos': vehiculos,
  '/admin/usuarios': usuarios,
  '/admin/roles': roles,
};