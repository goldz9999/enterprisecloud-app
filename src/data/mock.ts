/* Sample data shown in demo mode (copied from the design prototypes). */
import type { AuditEvent } from './types';

export const MOCK_TODAY = new Date(2026, 9, 2, 10, 46, 12);

export const AUDIT_USERS: Record<string, [string, string]> = {
  MR: ['María Rojas', 'Gerente de Operaciones'],
  RM: ['Rosa Medina', 'Contadora'],
  LP: ['Luis Paredes', 'Ejecutivo comercial'],
  AT: ['Ana Torres', 'Jefa de Compras'],
  JQ: ['Jorge Quispe', 'Almacén'],
  CH: ['Carlos Huamán', 'Almacén'],
  SY: ['Sistema', 'Proceso automático'],
};


type Change = [field: string, before: string, after: string];
// [minutes ago, user, action, module, record, description, result, changes | note]
export type RawEvent = [number, keyof typeof AUDIT_USERS, string, string, string, string, AuditEvent['result'], Change[] | string];

export const AUDIT_EVENTS: RawEvent[] = [
  [4, 'MR', 'Ingreso', 'Seguridad', 'maria.rojas@empresa.pe', 'Inicio de sesión', 'Exitoso', 'Autenticación con correo y contraseña. Sesión válida por 8 horas.'],
  [18, 'LP', 'Crear', 'Ventas', 'OV-2026-1284', 'Orden de venta · Distribuidora Andina', 'Exitoso', [['Total', '—', 'S/ 12,480.00'], ['Estado', '—', 'Pendiente']]],
  [26, 'RM', 'Editar', 'Ventas', 'OV-2026-1284', 'Cambio de estado de cobro', 'Exitoso', [['Estado', 'Pendiente', 'Pagado'], ['Medio de pago', '—', 'Transferencia BCP']]],
  [41, 'JQ', 'Ingreso', 'Seguridad', 'jorge.quispe@empresa.pe', 'Inicio de sesión', 'Fallido', 'Contraseña incorrecta (intento 2 de 5). La cuenta aún no confirmó su correo.'],
  [55, 'JQ', 'Editar', 'Finanzas', 'CxP · FA-0098', 'Intento de acceso a cuentas por pagar', 'Denegado', 'El rol Almacén no tiene el permiso finanzas.cxp.editar. Principio de mínimo privilegio.'],
  [72, 'SY', 'Crear', 'Documentos', 'F001-00248.xml', 'Comprobante electrónico generado', 'Exitoso', 'XML firmado y almacenado en el repositorio documental.'],
  [96, 'AT', 'Crear', 'Compras', 'OC-2026-0412', 'Orden de compra · Aceros del Sur', 'Exitoso', [['Total', '—', 'S/ 18,240.00'], ['Proveedor', '—', 'Aceros del Sur S.A.C.']]],
  [130, 'CH', 'Editar', 'Inventario', 'SKU-CEM-0042', 'Ajuste de stock · Almacén Lima', 'Exitoso', [['Stock', '42', '18'], ['Motivo', '—', 'Merma por humedad']]],
  [185, 'MR', 'Exportar', 'Ventas', 'Reporte ventas set-2026', 'Exportación a Excel · 312 filas', 'Exitoso', 'Archivo generado: ventas_2026-09.xlsx'],
  [240, 'LP', 'Descargar', 'Documentos', 'Contrato_suministro_2026_MineraAndes.pdf', 'Descarga de contrato', 'Exitoso', 'Descarga autorizada para el rol Ejecutivo comercial.'],
  [310, 'RM', 'Eliminar', 'Finanzas', 'MOV-CAJA-00871', 'Movimiento de caja duplicado', 'Exitoso', [['Monto', 'S/ 450.00', '—'], ['Estado', 'Registrado', 'Anulado']]],
  [420, 'MR', 'Crear', 'Administración', 'jorge.quispe@empresa.pe', 'Invitación de usuario · rol Almacén', 'Exitoso', [['Rol', '—', 'Almacén'], ['Estado', '—', 'Sin confirmar']]],
  [1460, 'AT', 'Editar', 'Compras', 'PRV-000142', 'Datos bancarios de proveedor', 'Exitoso', [['Cuenta', '191-0045…', '193-2210…'], ['Banco', 'BCP', 'Interbank']]],
  [1530, 'LP', 'Eliminar', 'Ventas', 'COT-2026-0311', 'Intento de eliminar cotización aprobada', 'Denegado', 'Las cotizaciones aprobadas solo pueden anularse por un Gerente.'],
  [1610, 'SY', 'Ingreso', 'Seguridad', 'admin@empresa.pe', 'Inicio de sesión desde IP desconocida', 'Fallido', '5 intentos fallidos. Cuenta bloqueada temporalmente por 15 minutos.'],
  [2900, 'CH', 'Crear', 'Inventario', 'TRF-2026-0088', 'Transferencia Lima → Callao', 'Exitoso', [['Productos', '—', '6 ítems'], ['Estado', '—', 'En tránsito']]],
  [3100, 'RM', 'Exportar', 'Finanzas', 'Conciliación set-2026', 'Exportación a Excel', 'Exitoso', 'Archivo generado: conciliacion_2026-09.xlsx'],
  [4400, 'MR', 'Editar', 'Administración', 'Rol: Ventas', 'Permisos de rol actualizados', 'Exitoso', [['ventas.descuento', 'Hasta 5%', 'Hasta 10%']]],
  [7300, 'LP', 'Crear', 'Ventas', 'OV-2026-1270', 'Orden de venta · Clínica San Gabriel', 'Exitoso', [['Total', '—', 'S/ 9,460.00']]],
  [11800, 'AT', 'Descargar', 'Documentos', 'OC-2026-0399.pdf', 'Descarga de orden de compra', 'Exitoso', 'Descarga autorizada para el rol Compras.'],
  [20500, 'JQ', 'Ingreso', 'Seguridad', 'jorge.quispe@empresa.pe', 'Inicio de sesión', 'Fallido', 'Contraseña incorrecta (intento 1 de 5).'],
  [30100, 'MR', 'Eliminar', 'Documentos', 'Borrador_contrato_v0.docx', 'Documento eliminado', 'Exitoso', 'El archivo pasa a la papelera por 30 días antes de borrarse definitivamente.'],
];


/** [name, category, linked operation, entity, size, date, uploaded by] */
export const DOCS: string[][] = [
  ['F001-00248.pdf', 'Facturas', 'OV-2026-1284', 'Distribuidora Andina S.A.C.', '182 KB', '02 oct 2026', 'María Rojas'],
  ['F001-00248.xml', 'Facturas', 'OV-2026-1284', 'Distribuidora Andina S.A.C.', '14 KB', '02 oct 2026', 'Sistema'],
  ['Contrato_suministro_2026_MineraAndes.pdf', 'Contratos', 'CLI-000318', 'Minera Los Andes S.A.', '2.4 MB', '01 oct 2026', 'Luis Paredes'],
  ['OC-2026-0412_Aceros_del_Sur.pdf', 'Órdenes de compra', 'OC-2026-0412', 'Aceros del Sur S.A.C.', '96 KB', '30 sep 2026', 'Ana Torres'],
  ['Guia_T001-00877.pdf', 'Guías de remisión', 'OV-2026-1282', 'Minera Los Andes S.A.', '128 KB', '30 sep 2026', 'Carlos Huamán'],
  ['Conciliacion_bancaria_set2026.xlsx', 'Otros', 'FIN-CB-2026-09', 'Banco de Crédito · Cta. 191-2345', '312 KB', '29 sep 2026', 'Rosa Medina'],
  ['F001-00241.pdf', 'Facturas', 'OV-2026-1281', 'Farmacias Salud Total S.A.C.', '176 KB', '27 sep 2026', 'María Rojas'],
  ['Recepcion_almacen_OC0409.jpg', 'Órdenes de compra', 'OC-2026-0409', 'Plásticos Lima S.R.L.', '1.8 MB', '26 sep 2026', 'Jorge Quispe'],
  ['Adenda_contrato_Textil_Arequipa.docx', 'Contratos', 'CLI-000207', 'Textil Arequipa S.R.L.', '64 KB', '24 sep 2026', 'Luis Paredes'],
  ['Nota_credito_FC01-00032.pdf', 'Facturas', 'OV-2026-1265', 'Comercial Norte Trujillo S.A.', '88 KB', '22 sep 2026', 'Rosa Medina'],
];

// 12-month sales history (oct 2025 – sep 2026) and the previous year, for Reportes.
export const MON = ['oct 25', 'nov', 'dic', 'ene 26', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep'];
export const SALES = [61240, 64810, 79530, 58320, 55140, 62710, 66420, 70180, 68940, 73510, 75230, 75120];
export const PREV = [55100, 57900, 71200, 54800, 52300, 56100, 59800, 62400, 61900, 64700, 66200, 67100];
export const ORDERS = [112, 118, 141, 104, 99, 113, 120, 126, 124, 131, 135, 133];
export const CLIENTS: [string, number][] = [['Minera Los Andes S.A.', 142380], ['Distribuidora Andina S.A.C.', 118920], ['Constructora Pacífico E.I.R.L.', 96410], ['Comercial Norte Trujillo S.A.', 71250], ['Agroexportadora Ica S.A.C.', 58730], ['Clínica San Gabriel S.A.', 44120], ['Textil Arequipa S.R.L.', 38960], ['Ferretería El Constructor E.I.R.L.', 29840]];
export const SUPPLIERS: [string, number][] = [['Aceros del Sur S.A.C.', 128400], ['Cementos Pacasmayo Dist. S.A.', 97250], ['Plásticos Lima S.R.L.', 61830], ['EPP Seguridad Total S.A.C.', 38420], ['Pinturas Andinas S.A.', 27190], ['Cables y Conductores Perú S.A.', 21960]];

// [sku, product, stock, unit cost, units sold in 90 days, ABC class]
export const ROTATION: [string, string, number, number, number, string][] = [['SKU-CEM-0042', 'Cemento Portland Tipo I 42.5 kg', 18, 28.5, 1840, 'A'], ['SKU-FIE-0912', 'Fierro corrugado 1/2" x 9 m', 240, 41.2, 1320, 'A'], ['SKU-PVC-0410', 'Tubo PVC 4" x 3 m clase 10', 9, 36.9, 410, 'A'], ['SKU-LAD-1818', 'Ladrillo King Kong 18 huecos', 5200, 0.92, 22400, 'B'], ['SKU-PIN-0004', 'Pintura látex blanco 4 L', 86, 52.3, 214, 'B'], ['SKU-CAB-1200', 'Cable THW 12 AWG x 100 m', 34, 189, 58, 'C'], ['SKU-EPP-1103', 'Guantes de nitrilo talla M x100', 12, 24.6, 96, 'C'], ['SKU-EPP-0201', 'Casco de seguridad ANSI', 140, 18.4, 62, 'C']];
