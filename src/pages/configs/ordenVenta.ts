import type { OrderConfig, OrderForm, OrderStepBase } from '../../features/order/types';
import { formatMoney as fmt } from '../../lib/format';

const STEPS: OrderStepBase[] = [
  { title: 'Cotización', doc: 'COT-2026-0318', meta: 'Aprobada 28 sep · L. Paredes', pending: '', action: '', verb: 'cotizar', who: 'Luis Paredes', histo: 'cotización aprobada por el cliente', when: '28 sep' },
  { title: 'Orden de venta', doc: 'OV-2026-1283', meta: 'Confirmada 02 oct · L. Paredes', pending: '', action: 'Confirmar orden', verb: 'confirmar', who: 'Luis Paredes', histo: 'confirmó la orden de venta', when: '02 oct' },
  { title: 'Despacho', doc: 'Guía T001-00881', meta: 'Salida de Almacén Callao', pending: 'Genera guía y salida de stock', action: 'Registrar despacho', verb: 'despachar', who: 'Carlos Huamán', histo: 'registró el despacho y la guía de remisión', when: 'ahora' },
  { title: 'Comprobante', doc: 'Factura F001-00249', meta: 'Emitida y enviada a SUNAT', pending: 'Genera la cuenta por cobrar', action: 'Emitir factura', verb: 'facturar', who: 'Rosa Medina', histo: 'emitió la factura electrónica', when: 'ahora' },
  { title: 'Cobro', doc: 'Cobro CB-2026-0532', meta: 'Transferencia BCP', pending: 'Cierra la cuenta por cobrar', action: 'Registrar cobro', verb: 'cobrar', who: 'Rosa Medina', histo: 'registró el cobro', when: 'ahora' },
];

/** What each step asks for (index-aligned with STEPS). */
const FORMS: OrderForm[] = [
  { intro: '', fields: [{ k: 'cod', label: 'Código', value: 'COT-2026-0318' }, { k: 'f', label: 'Fecha', type: 'date', value: '2026-09-28' }, { k: 'val', label: 'Válida hasta', type: 'date', value: '2026-10-12' }, { k: 'ven', label: 'Vendedor', value: 'Luis Paredes' }, { k: 'apr', label: 'Aprobada por (cliente)', value: 'Ing. Pedro Salas' }], doneMsg: '' },
  { intro: 'Confirma los datos comerciales. Al confirmar se reserva el stock en el almacén elegido.', submit: 'Confirmar orden de venta', note: 'Reserva 255 unidades en el almacén seleccionado.', doneMsg: 'Orden de venta confirmada y stock reservado.',
    fields: [{ k: 'ent', label: 'Fecha de entrega', type: 'date', value: '2026-10-05', required: true }, { k: 'alm', label: 'Almacén de despacho', type: 'select', options: ['Almacén Callao', 'Almacén Lima'], value: 'Almacén Callao' }, { k: 'cond', label: 'Condición de pago', type: 'select', options: ['Crédito 30 días', 'Crédito 15 días', 'Contado'], value: 'Crédito 30 días' }, { k: 'dir', label: 'Dirección de entrega', value: 'Av. Los Constructores 1450, Chorrillos, Lima', wide: true, required: true }] },
  { intro: 'Registra el traslado de la mercadería al cliente. Se emite la guía de remisión electrónica y se descuenta el stock.', submit: 'Generar guía y registrar salida', note: 'Se descontará del Almacén Callao: 170 bolsas de cemento, 60 varillas de fierro y 25 kg de clavos.', doneMsg: 'Guía de remisión T001-00881 generada. Salida SAL-2026-01942 registrada en el kardex.',
    fields: [{ k: 'ft', label: 'Fecha de traslado', type: 'date', value: '2026-10-03', required: true }, { k: 'mot', label: 'Motivo de traslado', type: 'select', options: ['Venta', 'Venta sujeta a confirmación'], value: 'Venta' }, { k: 'tra', label: 'Transportista', type: 'select', options: ['Transportes Rápido Sur S.A.C.', 'Movilidad propia'], value: 'Transportes Rápido Sur S.A.C.' }, { k: 'pla', label: 'Placa del vehículo', value: '', placeholder: 'Ej. F4Q-728', required: true }, { k: 'con', label: 'Conductor', value: '', placeholder: 'Nombre y DNI', required: true }, { k: 'lle', label: 'Punto de llegada', value: 'Av. Los Constructores 1450, Chorrillos', required: true }] },
  { intro: 'Emite el comprobante electrónico. Se envía a SUNAT y al correo del cliente, y se crea la cuenta por cobrar.', submit: 'Emitir factura', note: '', doneMsg: 'Factura F001-00249 emitida y aceptada por SUNAT. Cuenta por cobrar creada.',
    fields: [{ k: 'tipo', label: 'Tipo de comprobante', type: 'select', options: ['Factura electrónica', 'Boleta de venta electrónica'], value: 'Factura electrónica' }, { k: 'ser', label: 'Serie', type: 'select', options: ['F001', 'F002'], value: 'F001' }, { k: 'fe', label: 'Fecha de emisión', type: 'date', value: '2026-10-03', required: true }, { k: 'fv', label: 'Fecha de vencimiento', type: 'date', value: '2026-11-02', required: true }, { k: 'fp', label: 'Forma de pago', type: 'select', options: ['Crédito 30 días', 'Contado'], value: 'Crédito 30 días' }, { k: 'mail', label: 'Enviar a', value: 'compras@constructorapacifico.pe', required: true }] },
  { intro: 'Registra el pago recibido del cliente. Cierra la cuenta por cobrar y libera su línea de crédito.', submit: 'Registrar cobro', note: '', doneMsg: 'Cobro CB-2026-0532 registrado. La cuenta por cobrar quedó cancelada.',
    fields: [{ k: 'fc', label: 'Fecha de cobro', type: 'date', value: '2026-10-28', required: true }, { k: 'mon', label: 'Monto cobrado', value: '', required: true, total: true }, { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Depósito en cuenta', 'Cheque', 'Efectivo'], value: 'Transferencia' }, { k: 'cta', label: 'Cuenta destino', type: 'select', options: ['BCP · 191-2345678-0-12', 'Interbank · 200-3011223344'], value: 'BCP · 191-2345678-0-12' }, { k: 'op', label: 'N.º de operación', value: '', placeholder: 'Ej. 00482917', required: true }, { k: 'obs', label: 'Observación', value: '' }] },
];

export const ordenVenta: OrderConfig = {
  active: 'Órdenes de venta',
  section: 'Ventas',
  list: { label: 'Órdenes de venta', to: '/ventas/ordenes' },
  partyTo: '/mantenimiento/clientes',
  code: 'OV-2026-1283', kind: 'Orden de venta', issued: '02 oct 2026', partyLabel: 'Cliente',
  flowHint: 'Cotización → Orden de venta → Despacho → Comprobante → Cobro',
  party: { name: 'Constructora Pacífico E.I.R.L.', ruc: '20601122334', contact: 'Ing. Pedro Salas · 987 654 321', terms: 'Crédito 30 días', address: 'Av. Los Constructores 1450, Chorrillos, Lima' },
  whLabel: 'Despacho desde', warehouse: 'Almacén Callao', stockHead: 'Stock', sign: -1, stockAt: 3,
  lines: [
    { name: 'Cemento Portland Tipo I 42.5 kg', sku: 'SKU-CEM-0042', unit: 'bolsa', qty: 170, price: 28.5, stock: 420 },
    { name: 'Fierro corrugado 1/2" x 9 m', sku: 'SKU-FIE-0912', unit: 'varilla', qty: 60, price: 41.2, stock: 310 },
    { name: 'Clavos para madera 3"', sku: 'SKU-CLA-0300', unit: 'kg', qty: 25, price: 9.71, stock: 95 },
  ],
  initialDone: 2,
  status: [['Cotizada', 'blue'], ['Confirmada · por despachar', 'amber'], ['Despachada · por facturar', 'amber'], ['Facturada · por cobrar', 'blue'], ['Cobrada · completada', 'green']],
  effects: (total: number) => [
    { module: 'Mantenimiento', text: 'Usa cliente y productos registrados (precios de lista)', ref: 'CLI-000245 · 3 productos', at: 0 },
    { module: 'Ventas', text: 'Reserva de stock para la orden', ref: '255 unidades reservadas en Almacén Callao', at: 1 },
    { module: 'Inventario', text: 'Salida de almacén y movimiento en kardex', ref: 'SAL-2026-01942 · −170 / −60 / −25', at: 2 },
    { module: 'Documentos', text: 'Guía de remisión electrónica', ref: 'T001-00881.pdf', at: 2 },
    { module: 'Finanzas', text: 'Cuenta por cobrar · vence 01 nov 2026', ref: 'CxC ' + fmt(total), at: 3 },
    { module: 'Finanzas', text: 'Ingreso a bancos y cierre de la cuenta por cobrar', ref: 'BCP Cta. 191-2345 · ' + fmt(total), at: 4 },
  ],
  creditLabel: 'Línea de crédito usada',
  credit: (done: number, total: number) => { const used = 13480 + (done >= 2 && done < 5 ? total : 0); return { text: 'S/ ' + Math.round(used).toLocaleString('en-US') + ' / 40,000', pct: (used / 40000 * 100) + '%', color: used / 40000 > 0.8 ? 'var(--red)' : 'var(--accent)' }; },
  facts: [{ k: 'Vendedor', v: 'Luis Paredes' }, { k: 'Fecha de entrega', v: '05 oct 2026' }, { k: 'Moneda', v: 'Soles (PEN)' }, { k: 'Tipo comprobante', v: 'Factura electrónica' }, { k: 'Origen', v: 'Cotización COT-2026-0318' }],
  docs: [{ name: 'COT-2026-0318.pdf', at: 0 }, { name: 'OV-2026-1283.pdf', at: 1 }, { name: 'Guia_T001-00881.pdf', at: 2 }, { name: 'F001-00249.pdf', at: 3 }, { name: 'F001-00249.xml', at: 3 }],
  steps: STEPS.map((s, i) => ({ ...s, ...FORMS[i] })),
};
