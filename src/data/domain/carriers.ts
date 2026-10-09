import type { DB, Row } from '../types';

/** Valor de "Empresa" para el personal y los vehículos propios. */
export const OWN_FLEET = 'Movilidad propia';

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Un proveedor es transportista si su rubro menciona "transporte" (sin importar mayúsculas ni tildes: "Transportes Rápido", "transporte de carga"…). */
export const isCarrier = (supplier: Row) => plain(String(supplier.rubro ?? '')).includes('transport');

/** Opciones de "Empresa / Transportista": la flota propia más los proveedores activos con rubro de transporte. */
export const carrierOptions = (d: DB): string[] => [
  OWN_FLEET,
  ...d.records.proveedores.filter(p => p.estado !== 'Inactivo' && isCarrier(p)).map(p => String(p.razon)),
];
