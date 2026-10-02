export const TIPOS_DOCUMENTO = ['RUC', 'DNI', 'CE'] as const;
export const CONDICIONES_PAGO = ['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días'] as const;
export const VENDEDORES = ['Luis Paredes', 'María Rojas'] as const;
export const ESTADOS_CLIENTE = ['Activo', 'Inactivo'] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export type CondicionPago = (typeof CONDICIONES_PAGO)[number];
export type EstadoCliente = (typeof ESTADOS_CLIENTE)[number];

export interface Cliente {
  id: number;
  /** Internal code, e.g. CLI-000245. Assigned on creation. */
  codigo: string;
  razonSocial: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  contacto: string;
  telefono: string;
  /** Address where electronic invoices are sent. */
  correo: string;
  direccion: string;
  condicionPago: CondicionPago;
  /** Credit line in soles (S/). */
  lineaCredito: number;
  vendedor: string;
  estado: EstadoCliente;
}

/** Editable fields — everything except the system-assigned id and code. */
export type ClienteInput = Omit<Cliente, 'id' | 'codigo'>;
