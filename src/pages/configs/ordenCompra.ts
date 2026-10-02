import type { OrderConfig, OrderForm, OrderStepBase } from '../../features/order/types';
import { formatMoney as fmt } from '../../lib/format';

const STEPS: OrderStepBase[] = [
  { title: 'Solicitud', doc: 'SOL-2026-0087', meta: 'Almacén · J. Quispe · 27 sep', pending: '', action: '', verb: 'solicitar', who: 'Jorge Quispe', histo: 'solicitó reposición por stock bajo mínimo', when: '27 sep' },
  { title: 'Orden de compra', doc: 'OC-2026-0412', meta: 'Aprobada 30 sep · M. Rojas', pending: '', action: 'Aprobar orden', verb: 'aprobar', who: 'María Rojas', histo: 'aprobó la orden de compra', when: '30 sep' },
  { title: 'Recepción', doc: 'Ingreso NI-2026-0611', meta: 'Entrada a Almacén Lima', pending: 'Genera ingreso de stock', action: 'Registrar recepción', verb: 'recibir', who: 'Jorge Quispe', histo: 'registró la recepción de mercadería', when: 'ahora' },
  { title: 'Factura proveedor', doc: 'Factura F002-08812', meta: 'Validada contra OC y recepción', pending: 'Genera la cuenta por pagar', action: 'Registrar factura', verb: 'registrar factura', who: 'Rosa Medina', histo: 'registró la factura del proveedor', when: 'ahora' },
  { title: 'Pago', doc: 'Pago PG-2026-0219', meta: 'Transferencia Interbank', pending: 'Cierra la cuenta por pagar', action: 'Registrar pago', verb: 'pagar', who: 'Rosa Medina', histo: 'registró el pago al proveedor', when: 'ahora' },
];

/** What each step asks for (index-aligned with STEPS). */
const FORMS: OrderForm[] = [
  { intro: '', fields: [{ k: 'cod', label: 'Código', value: 'SOL-2026-0087' }, { k: 'f', label: 'Fecha', type: 'date', value: '2026-09-27' }, { k: 'sol', label: 'Solicitante', value: 'Jorge Quispe · Almacén' }, { k: 'pri', label: 'Prioridad', value: 'Alta' }, { k: 'mot', label: 'Motivo', value: 'Reposición por stock bajo mínimo' }], doneMsg: '' },
  { intro: 'Elige el proveedor y las condiciones. Al aprobar se envía la orden al proveedor.', submit: 'Aprobar orden de compra', note: 'Requiere rol Gerencia. Se notifica al proveedor por correo.', doneMsg: 'Orden de compra aprobada y enviada al proveedor.',
    fields: [{ k: 'prv', label: 'Proveedor', type: 'select', options: ['Aceros del Sur S.A.C.', 'Cementos Pacasmayo Dist. S.A.', 'Plásticos Lima S.R.L.'], value: 'Aceros del Sur S.A.C.' }, { k: 'ent', label: 'Entrega pactada', type: 'date', value: '2026-10-03', required: true }, { k: 'alm', label: 'Almacén destino', type: 'select', options: ['Almacén Lima', 'Almacén Callao'], value: 'Almacén Lima' }, { k: 'cond', label: 'Condición de pago', type: 'select', options: ['Crédito 45 días', 'Crédito 30 días', 'Contado'], value: 'Crédito 45 días' }] },
  { intro: 'Registra la mercadería que llegó del proveedor. Se genera la nota de ingreso y aumenta el stock.', submit: 'Registrar ingreso a almacén', note: 'Se sumará al Almacén Lima: 300 varillas de fierro, 150 kg de alambre y 120 kg de clavos.', doneMsg: 'Nota de ingreso NI-2026-0611 registrada. Stock y costo promedio actualizados.',
    fields: [{ k: 'fr', label: 'Fecha de recepción', type: 'date', value: '2026-10-03', required: true }, { k: 'gr', label: 'Guía del proveedor', value: '', placeholder: 'Ej. EG07-00312', required: true }, { k: 'rec', label: 'Recibido por', type: 'select', options: ['Jorge Quispe', 'Carlos Huamán'], value: 'Jorge Quispe' }, { k: 'alm', label: 'Almacén', type: 'select', options: ['Almacén Lima', 'Almacén Callao'], value: 'Almacén Lima' }, { k: 'est', label: 'Estado de la mercadería', type: 'select', options: ['Conforme', 'Con observaciones'], value: 'Conforme' }, { k: 'obs', label: 'Observación', value: '' }] },
  { intro: 'Registra la factura que envió el proveedor. Se valida contra la orden y la recepción, y se crea la cuenta por pagar.', submit: 'Registrar factura', note: 'Validación de 3 vías: orden de compra = recepción = factura.', doneMsg: 'Factura F002-08812 registrada. Cuenta por pagar creada.',
    fields: [{ k: 'num', label: 'Serie y número', value: '', placeholder: 'Ej. F002-08812', required: true }, { k: 'fe', label: 'Fecha de emisión', type: 'date', value: '2026-10-03', required: true }, { k: 'fv', label: 'Fecha de vencimiento', type: 'date', value: '2026-11-17', required: true }, { k: 'mon', label: 'Monto de la factura', value: '', required: true, total: true }, { k: 'val', label: 'Validación', type: 'select', options: ['Coincide con OC y recepción', 'Con diferencias'], value: 'Coincide con OC y recepción' }] },
  { intro: 'Registra el pago al proveedor. Cierra la cuenta por pagar.', submit: 'Registrar pago', note: '', doneMsg: 'Pago PG-2026-0219 registrado. La cuenta por pagar quedó cancelada.',
    fields: [{ k: 'fp', label: 'Fecha de pago', type: 'date', value: '2026-11-14', required: true }, { k: 'mon', label: 'Monto pagado', value: '', required: true, total: true }, { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Cheque'], value: 'Transferencia' }, { k: 'cta', label: 'Cuenta origen', type: 'select', options: ['Interbank · 200-3011223344', 'BCP · 191-2345678-0-12'], value: 'Interbank · 200-3011223344' }, { k: 'op', label: 'N.º de operación', value: '', placeholder: 'Ej. 00912744', required: true }, { k: 'obs', label: 'Observación', value: '' }] },
];

export const ordenCompra: OrderConfig = {
  active: 'Órdenes de compra',
  section: 'Compras',
  list: { label: 'Órdenes de compra', to: '/compras/ordenes' },
  partyTo: '/mantenimiento/proveedores',
  code: 'OC-2026-0412', kind: 'Orden de compra', issued: '30 sep 2026', partyLabel: 'Proveedor',
  flowHint: 'Solicitud → Orden de compra → Recepción → Factura del proveedor → Pago',
  party: { name: 'Aceros del Sur S.A.C.', ruc: '20433221109', contact: 'Lic. Karina Vela · 945 112 908', terms: 'Crédito 45 días', address: 'Av. Industrial 2280, Ate, Lima' },
  whLabel: 'Ingresa a', warehouse: 'Almacén Lima', stockHead: 'Stock', sign: 1, stockAt: 3,
  lines: [
    { name: 'Fierro corrugado 1/2" x 9 m', sku: 'SKU-FIE-0912', unit: 'varilla', qty: 300, price: 34.8, stock: 240 },
    { name: 'Alambre negro recocido N.º 16', sku: 'SKU-ALA-0016', unit: 'kg', qty: 150, price: 5.4, stock: 38 },
    { name: 'Clavos para madera 3"', sku: 'SKU-CLA-0300', unit: 'kg', qty: 120, price: 7.9, stock: 95 },
  ],
  initialDone: 2,
  status: [['Solicitada', 'blue'], ['Aprobada · por recibir', 'amber'], ['Recibida · por facturar', 'amber'], ['Facturada · por pagar', 'blue'], ['Pagada · completada', 'green']],
  effects: (total: number) => [
    { module: 'Mantenimiento', text: 'Usa proveedor y productos registrados (costos pactados)', ref: 'PRV-000142 · 3 productos', at: 0 },
    { module: 'Compras', text: 'Compromiso de compra con el proveedor', ref: 'Entrega pactada 03 oct 2026', at: 1 },
    { module: 'Inventario', text: 'Ingreso a almacén y movimiento en kardex', ref: 'NI-2026-0611 · +300 / +150 / +120', at: 2 },
    { module: 'Inventario', text: 'Actualiza costo promedio de los productos', ref: 'Fierro 1/2": S/ 35.10 → S/ 34.92', at: 2 },
    { module: 'Finanzas', text: 'Cuenta por pagar · vence 14 nov 2026', ref: 'CxP ' + fmt(total), at: 3 },
    { module: 'Finanzas', text: 'Egreso de bancos y cierre de la cuenta por pagar', ref: 'Interbank Cta. 200-3011 · ' + fmt(total), at: 4 },
  ],
  creditLabel: 'Crédito disponible con el proveedor',
  credit: (done: number, total: number) => { const used = 21400 + (done >= 2 && done < 5 ? total : 0); return { text: 'S/ ' + Math.round(used).toLocaleString('en-US') + ' / 60,000', pct: (used / 60000 * 100) + '%', color: used / 60000 > 0.8 ? 'var(--red)' : 'var(--accent)' }; },
  facts: [{ k: 'Comprador', v: 'Ana Torres' }, { k: 'Aprobado por', v: 'María Rojas' }, { k: 'Entrega pactada', v: '03 oct 2026' }, { k: 'Moneda', v: 'Soles (PEN)' }, { k: 'Origen', v: 'Solicitud SOL-2026-0087' }],
  docs: [{ name: 'SOL-2026-0087.pdf', at: 0 }, { name: 'OC-2026-0412.pdf', at: 1 }, { name: 'NI-2026-0611.pdf', at: 2 }, { name: 'F002-08812.pdf', at: 3 }, { name: 'F002-08812.xml', at: 3 }],
  steps: STEPS.map((s, i) => ({ ...s, ...FORMS[i] })),
};
