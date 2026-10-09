import type { Tone } from '../../components/StatusChip';
import { addDays, fmtDate, fmtDayMonth, isoDate, parseDate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { currentUser, nextCode } from '../store';
import type { DB, Order, OrderLine, OrderParty, Row } from '../types';
import { audit } from './audit';
import { carrierOptions } from './carriers';
import { addGeneratedDoc, renderDocHtml } from './documents';
import { bankAccounts, dueFromTerm, termDays } from './finance';
import { available, moveStock, productBySku, stockRow, updateAverageCost } from './stock';

export const PAY_TERMS = ['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días'];

/** Condiciones de pago a ofrecer: las de siempre más las que ya usan clientes y proveedores (p. ej. "Crédito 60 días"). */
export const payTermOptions = (d: DB): string[] => {
  const used = [...d.records.clientes, ...d.records.proveedores].map(r => String(r.cond ?? '').trim()).filter(Boolean);
  const days = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? 0);
  return [...new Set([...PAY_TERMS, ...used])].sort((a, b) => days(a) - days(b));
};

export interface StepField {
  k: string;
  label: string;
  type?: 'text' | 'date' | 'select' | 'number';
  options?: string[];
  value: string;
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
}

export interface StepDef {
  title: string;
  /** Header button label while this is the next step. */
  action: string;
  verb: string;
  pending: string;
  histo: string;
  intro: string;
  submit: string;
  fields: (o: Order, d: DB, values: Record<string, string>) => StepField[];
  note: (o: Order, d: DB) => string;
  meta: (o: Order) => string;
  doneMsg: (o: Order) => string;
  /**
   * Applies the step's effects to other modules. Returns an error to block completion,
   * or `stay` to record the effect without completing the step (e.g. partial payment).
   */
  apply?: (d: DB, o: Order, v: Record<string, string>) => { error?: string; stay?: string; doc?: string } | void;
}

const year = () => new Date().getFullYear();
const today = () => isoDate(new Date());
const units = (o: Order) => o.lines.reduce((a, l) => a + l.qty, 0);
const lineSummary = (o: Order) => o.lines.map(l => `${l.qty.toLocaleString('en-US')} ${l.unit} de ${l.name}`).join(', ');

export function orderSubtotal(o: Pick<Order, 'lines'>) {
  return o.lines.reduce((a, l) => a + l.qty * l.price, 0);
}
/** Total with IGV, rounded to cents (what gets invoiced and collected). */
export function orderTotal(o: Pick<Order, 'lines' | 'igvRate'>) {
  return Math.round((orderSubtotal(o) * (1 + o.igvRate) + Number.EPSILON) * 100) / 100;
}

export function warehouses(d: DB): string[] {
  const active = d.records.almacenes.filter(a => a.estado !== 'Inactivo').map(a => String(a.nombre));
  return active.length ? active : ['Almacén principal'];
}

export function igvRate(d: DB): number {
  const v = String(d.settings.igv ?? '18%');
  if (v === 'Exonerado') return 0;
  const m = /(\d+)/.exec(v);
  return m ? Number(m[1]) / 100 : 0.18;
}

const allowNegative = (d: DB) => d.settings.neg === true;

function stockError(d: DB, o: Order, alm: string, physical: boolean): string | undefined {
  if (allowNegative(d)) return;
  const short = o.lines.filter(l => {
    const r = stockRow(d, l.sku, alm);
    const have = physical ? Number(r?.stock ?? 0) : available(d, l.sku, alm);
    return have < l.qty;
  });
  if (!short.length) return;
  return `Stock insuficiente en ${alm}: ${short.map(l => l.name).join(', ')}. Registra una compra o transferencia, o activa "Stock negativo" en Configuración.`;
}

function findReceivable(d: DB, o: Order): Row | undefined {
  return d.records.cxc.find(r => r.orden === o.code);
}
function findPayable(d: DB, o: Order): Row | undefined {
  return d.records.cxp.find(r => r.orden === o.code);
}

// ------------------------------------------------------------------ sales

const SALE_STEPS: StepDef[] = [
  {
    title: 'Cotización', action: '', verb: 'cotizar', pending: '', histo: 'registró la venta',
    intro: '', submit: '',
    fields: o => [
      { k: 'cod', label: 'Origen', value: o.origin ?? 'Venta directa' },
      { k: 'f', label: 'Fecha', type: 'date', value: isoDate(new Date(o.createdAt)) },
      { k: 'ven', label: 'Vendedor', value: o.seller },
    ],
    note: () => '',
    meta: o => (o.origin ? `Cotización aprobada · ${o.seller}` : `Venta directa · ${o.seller}`),
    doneMsg: () => '',
  },
  {
    title: 'Orden de venta', action: 'Confirmar orden', verb: 'confirmar', pending: 'Reserva el stock', histo: 'confirmó la orden de venta',
    intro: 'Confirma los datos comerciales. Al confirmar se reserva el stock en el almacén elegido.',
    submit: 'Confirmar orden de venta',
    fields: (o, d) => [
      { k: 'ent', label: 'Fecha de entrega', type: 'date', value: isoDate(addDays(new Date(), 3)), required: true },
      { k: 'alm', label: 'Almacén de despacho', type: 'select', options: warehouses(d), value: o.warehouse },
      { k: 'cond', label: 'Condición de pago', type: 'select', options: payTermOptions(d), value: o.party.terms || 'Contado' },
      { k: 'dir', label: 'Dirección de entrega', value: o.party.address, wide: true, required: true },
    ],
    note: o => `Reserva ${units(o).toLocaleString('en-US')} unidades en el almacén seleccionado.`,
    meta: o => `Confirmada ${fmtDayMonth(new Date(o.log[1]?.at ?? Date.now()))} · ${o.log[1]?.who ?? ''}`,
    doneMsg: () => 'Orden de venta confirmada y stock reservado.',
    apply: (d, o, v) => {
      const err = stockError(d, o, v.alm, false);
      if (err) return { error: err };
      o.warehouse = v.alm;
      o.party.terms = v.cond;
      o.lines.forEach(l => moveStock(d, { sku: l.sku, name: l.name, alm: v.alm, delta: 0, reserve: l.qty }));
      return { doc: o.code };
    },
  },
  {
    title: 'Despacho', action: 'Registrar despacho', verb: 'despachar', pending: 'Genera guía y salida de stock', histo: 'registró el despacho y la guía de remisión',
    intro: 'Registra el traslado de la mercadería al cliente. Se emite la guía de remisión electrónica y se descuenta el stock.',
    submit: 'Generar guía y registrar salida',
    fields: (o, d, values) => {
      const tra = values.tra ?? 'Movilidad propia';
      const isMobPropia = tra === 'Movilidad propia';
      // Vehicles and conductors filtered by the selected transportista
      const vehiculosEmpresa = (d.records as any).vehiculos
        ? (d.records as any).vehiculos.filter((v: any) => v.estado === 'Activo' && (isMobPropia ? v.empresa === 'Movilidad propia' : v.empresa === tra))
        : [];
      const placas = vehiculosEmpresa.map((v: any) => String(v.placa));
      const conductoresList = (d.records as any).conductores
        ? (d.records as any).conductores.filter((c: any) => c.estado === 'Activo' && (isMobPropia ? c.empresa === 'Movilidad propia' : c.empresa === tra))
        : [];
      const nombresConductores = conductoresList.map((c: any) => String(c.nombre));
      // Autocomplete: if placa chosen, find its conductor and vice-versa
      const selectedVehiculo = vehiculosEmpresa.find((v: any) => v.placa === values.pla);
      const selectedConductor = conductoresList.find((c: any) => c.nombre === values.con || (selectedVehiculo && selectedVehiculo.conductor?.startsWith(c.nombre)));
      const autoPlaca = selectedConductor
        ? (vehiculosEmpresa.find((v: any) => v.conductor?.startsWith(selectedConductor.nombre))?.placa ?? values.pla ?? '')
        : values.pla ?? '';
      const autoCon = selectedVehiculo
        ? (selectedVehiculo.conductor?.split(' · ')[0] ?? values.con ?? '')
        : values.con ?? '';
      const useRegistered = placas.length > 0;
      return [
        { k: 'ft', label: 'Fecha de traslado', type: 'date', value: today(), required: true },
        { k: 'mot', label: 'Motivo de traslado', type: 'select', options: ['Venta', 'Venta sujeta a confirmación'], value: 'Venta' },
        { k: 'tra', label: 'Transportista', type: 'select', options: carrierOptions(d), value: 'Movilidad propia' },
        useRegistered
          ? { k: 'pla', label: 'Placa del vehículo', type: 'select' as const, options: placas, value: autoPlaca || placas[0], required: true }
          : { k: 'pla', label: 'Placa del vehículo', value: values.pla ?? '', placeholder: 'Ej. F4Q-728', required: true },
        useRegistered && nombresConductores.length > 0
          ? { k: 'con', label: 'Conductor', type: 'select' as const, options: nombresConductores, value: autoCon || nombresConductores[0], required: true }
          : { k: 'con', label: 'Conductor (nombre)', value: values.con ?? '', placeholder: 'Ej. Juan Pérez García', required: true },
        { k: 'lle', label: 'Punto de llegada', value: o.forms[1]?.dir ?? o.party.address, required: true },
      ];
    },
    note: o => `Se descontará del ${o.warehouse}: ${o.lines.map(l => l.qty.toLocaleString('en-US') + ' ' + l.unit).join(', ')}.`,
    meta: o => `Salida de ${o.warehouse}`,
    doneMsg: o => `Guía de remisión ${o.docs[2]?.replace('Guía ', '')} generada. Stock descontado y registrado en el kardex.`,
    apply: (d, o, v) => {
      const err = stockError(d, o, o.warehouse, true);
      if (err) return { error: err };
      const guia = nextCode(d, `${d.settings.sg || 'T001'}-`, 5);
      o.lines.forEach(l => moveStock(d, { sku: l.sku, name: l.name, alm: o.warehouse, delta: -l.qty, reserve: -l.qty, tipo: 'Salida', doc: guia, costo: Number(productBySku(d, l.sku)?.costo ?? 0) }));
      addGeneratedDoc(d, {
        name: `Guia_${guia}.pdf`, cat: 'Guías de remisión', ref: o.code, entity: o.party.name,
        html: renderDocHtml(d, { title: 'Guía de remisión electrónica', number: guia, party: o.party, lines: o.lines, facts: [['Motivo', v.mot], ['Transportista', v.tra], ['Placa', v.pla], ['Conductor', v.con], ['Punto de partida', o.warehouse], ['Punto de llegada', v.lle]] }),
      });
      return { doc: 'Guía ' + guia };
    },
  },
  {
    title: 'Comprobante', action: 'Emitir comprobante', verb: 'facturar', pending: 'Genera la cuenta por cobrar', histo: 'emitió el comprobante electrónico',
    intro: 'Emite el comprobante electrónico. Se envía a SUNAT y al correo del cliente, y se crea la cuenta por cobrar.',
    submit: 'Emitir comprobante',
    fields: (o, d, v) => {
      const isBoleta = (v.tipo ?? (o.party.ruc.length === 11 ? 'Factura electrónica' : 'Boleta de venta electrónica')) === 'Boleta de venta electrónica';
      return [
        { k: 'tipo', label: 'Tipo de comprobante', type: 'select', options: ['Factura electrónica', 'Boleta de venta electrónica'], value: o.party.ruc.length === 11 ? 'Factura electrónica' : 'Boleta de venta electrónica' },
        { k: 'ser', label: 'Serie', type: 'select', options: isBoleta ? [String(d.settings.sb || 'B001')] : [String(d.settings.sf || 'F001')], value: isBoleta ? String(d.settings.sb || 'B001') : String(d.settings.sf || 'F001') },
        { k: 'fe', label: 'Fecha de emisión', type: 'date', value: today(), required: true },
        { k: 'fv', label: 'Fecha de vencimiento', type: 'date', value: isoDate(dueFromTerm(o.party.terms)), required: true },
        { k: 'fp', label: 'Forma de pago', type: 'select', options: [...new Set([o.party.terms || 'Contado', 'Contado'])], value: o.party.terms || 'Contado' },
        { k: 'mail', label: 'Enviar a', value: o.party.email ?? '', required: true },
      ];
    },
    note: () => '',
    meta: o => (o.forms[3]?.sunat === 'Pendiente' ? 'Emitida · pendiente de envío a SUNAT' : 'Emitida y enviada a SUNAT'),
    doneMsg: o => `${o.docs[3]} emitida. Cuenta por cobrar creada.`,
    apply: (d, o, v) => {
      const boleta = v.tipo === 'Boleta de venta electrónica';
      const num = nextCode(d, `${v.ser}-`, 5, d.records.comprobantes);
      const total = orderTotal(o);
      const sunat = d.settings.auto === false ? 'Pendiente' : 'Aceptado';
      v.sunat = sunat;
      d.records.comprobantes.unshift({
        _id: Math.max(0, ...d.records.comprobantes.map(c => c._id)) + 1,
        num, tipo: boleta ? 'Boleta' : 'Factura', cliente: o.party.name, ruc: o.party.ruc.length === 8 ? 'DNI ' + o.party.ruc : o.party.ruc,
        emision: fmtDate(parseDate(v.fe) ?? new Date()), vence: fmtDate(parseDate(v.fv) ?? new Date()), total: Math.round(total * 100) / 100, sunat, orden: o.code,
      });
      const html = renderDocHtml(d, { title: boleta ? 'Boleta de venta electrónica' : 'Factura electrónica', number: num, party: o.party, lines: o.lines, igvRate: o.igvRate, facts: [['Vencimiento', fmtDate(parseDate(v.fv) ?? new Date())], ['Forma de pago', v.fp], ['Orden', o.code]] });
      addGeneratedDoc(d, { name: `${num}.pdf`, cat: 'Facturas', ref: o.code, entity: o.party.name, html });
      addGeneratedDoc(d, { name: `${num}.xml`, cat: 'Facturas', ref: o.code, entity: o.party.name, html });
      return { doc: (boleta ? 'Boleta ' : 'Factura ') + num };
    },
  },
  {
    title: 'Cobro', action: 'Registrar cobro', verb: 'cobrar', pending: 'Cierra la cuenta por cobrar', histo: 'registró el cobro',
    intro: 'Registra el pago recibido del cliente. Cierra la cuenta por cobrar y libera su línea de crédito.',
    submit: 'Registrar cobro',
    fields: (o, d, v) => {
      const saldo = Number(findReceivable(d, o)?.saldo ?? orderTotal(o));
      const accounts = bankAccounts(d);
      return [
        { k: 'fc', label: 'Fecha de cobro', type: 'date', value: today(), required: true },
        { k: 'mon', label: 'Monto cobrado (S/)', type: 'number', value: saldo.toFixed(2), required: true },
        { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Depósito en cuenta', 'Cheque', 'Efectivo'], value: accounts.length ? 'Transferencia' : 'Efectivo' },
        { k: 'cta', label: 'Cuenta destino', type: 'select', options: v.med === 'Efectivo' ? ['Caja'] : accounts.length ? accounts : ['Caja'], value: v.med === 'Efectivo' || !accounts.length ? 'Caja' : accounts[0] },
        { k: 'op', label: 'N.º de operación', value: '', placeholder: 'Ej. 00482917', required: v.med !== 'Efectivo' },
        { k: 'obs', label: 'Observación', value: '' },
      ];
    },
    note: (o, d) => {
      const r = findReceivable(d, o);
      return r ? `Saldo pendiente ${formatMoney(Number(r.saldo))} de ${formatMoney(Number(r.total))}. Si cobras menos, queda como cobro parcial.` : '';
    },
    meta: o => `${o.forms[4]?.med ?? ''} · ${o.forms[4]?.cta ?? ''}`,
    doneMsg: o => `${o.docs[4]} registrado. La cuenta por cobrar quedó cancelada.`,
    apply: (d, o) => {
      const r = findReceivable(d, o);
      // El cobro ya se registró en el servidor (OrderPage -> collectRemote); aquí solo se lee el saldo resultante.
      const left = Number(r?.saldo ?? 0);
      if (left > 0) return { stay: `Cobro parcial registrado. Saldo pendiente: ${formatMoney(left)}.` };
      return { doc: 'Cobro ' + nextCode(d, `CB-${year()}-`, 4) };
    },
  },
];

// ------------------------------------------------------------------ purchases

const PURCHASE_STEPS: StepDef[] = [
  {
    title: 'Solicitud', action: '', verb: 'solicitar', pending: '', histo: 'registró la compra',
    intro: '', submit: '',
    fields: o => [
      { k: 'cod', label: 'Origen', value: o.origin ?? 'Compra directa' },
      { k: 'f', label: 'Fecha', type: 'date', value: isoDate(new Date(o.createdAt)) },
      { k: 'sol', label: 'Solicitante / comprador', value: o.seller },
    ],
    note: () => '',
    meta: o => (o.origin ? `Solicitud aprobada · ${o.seller}` : `Compra directa · ${o.seller}`),
    doneMsg: () => '',
  },
  {
    title: 'Orden de compra', action: 'Aprobar orden', verb: 'aprobar', pending: 'Requiere aprobación', histo: 'aprobó la orden de compra',
    intro: 'Elige el proveedor y las condiciones. Al aprobar se envía la orden al proveedor.',
    submit: 'Aprobar orden de compra',
    fields: (o, d) => [
      { k: 'prv', label: 'Proveedor', type: 'select', options: [...new Set([o.party.name, ...d.records.proveedores.filter(p => p.estado !== 'Inactivo').map(p => String(p.razon))])], value: o.party.name },
      { k: 'ent', label: 'Entrega pactada', type: 'date', value: isoDate(addDays(new Date(), 5)), required: true },
      { k: 'alm', label: 'Almacén destino', type: 'select', options: warehouses(d), value: o.warehouse },
      { k: 'cond', label: 'Condición de pago', type: 'select', options: payTermOptions(d), value: o.party.terms || 'Contado' },
    ],
    note: () => 'Requiere permiso de aprobación. El proveedor recibe la orden por correo.',
    meta: o => `Aprobada ${fmtDayMonth(new Date(o.log[1]?.at ?? Date.now()))} · ${o.log[1]?.who ?? ''}`,
    doneMsg: () => 'Orden de compra aprobada y enviada al proveedor.',
    apply: (d, o, v) => {
      if (v.prv !== o.party.name) {
        const p = d.records.proveedores.find(x => x.razon === v.prv);
        if (p) o.party = partyFromSupplier(p);
      }
      o.warehouse = v.alm;
      o.party.terms = v.cond;
      return { doc: o.code };
    },
  },
  {
    title: 'Recepción', action: 'Registrar recepción', verb: 'recibir', pending: 'Genera ingreso de stock', histo: 'registró la recepción de mercadería',
    intro: 'Registra la mercadería que llegó del proveedor. Se genera la nota de ingreso y aumenta el stock.',
    submit: 'Registrar ingreso a almacén',
    fields: (o, d) => [
      { k: 'fr', label: 'Fecha de recepción', type: 'date', value: today(), required: true },
      { k: 'gr', label: 'Guía del proveedor', value: '', placeholder: 'Ej. EG07-00312', required: true },
      { k: 'rec', label: 'Recibido por', type: 'select', options: [...new Set([currentUser(d).name, ...d.records.usuarios.filter(u => u.estado === 'Activo').map(u => String(u.nombre))])], value: currentUser(d).name },
      { k: 'alm', label: 'Almacén', type: 'select', options: warehouses(d), value: o.warehouse },
      { k: 'est', label: 'Estado de la mercadería', type: 'select', options: ['Conforme', 'Con observaciones'], value: 'Conforme' },
      { k: 'obs', label: 'Observación', value: '' },
    ],
    note: o => `Se sumará al ${o.warehouse}: ${lineSummary(o)}.`,
    meta: o => `Entrada a ${o.forms[2]?.alm ?? o.warehouse}`,
    doneMsg: o => `Nota de ingreso ${o.docs[2]?.replace('Ingreso ', '')} registrada. Stock y costo promedio actualizados.`,
    apply: (d, o, v) => {
      const ni = nextCode(d, `NI-${year()}-`, 4);
      o.warehouse = v.alm;
      o.lines.forEach(l => {
        moveStock(d, { sku: l.sku, name: l.name, alm: v.alm, delta: l.qty, tipo: 'Entrada', doc: ni, costo: l.price });
        updateAverageCost(d, l.sku, l.qty, l.price);
      });
      addGeneratedDoc(d, {
        name: `${ni}.pdf`, cat: 'Órdenes de compra', ref: o.code, entity: o.party.name,
        html: renderDocHtml(d, { title: 'Nota de ingreso', number: ni, party: o.party, partyLabel: 'Proveedor', lines: o.lines, facts: [['Orden de compra', o.code], ['Guía del proveedor', v.gr], ['Almacén', v.alm], ['Estado', v.est], ['Recibido por', v.rec]] }),
      });
      return { doc: 'Ingreso ' + ni };
    },
  },
  {
    title: 'Factura proveedor', action: 'Registrar factura', verb: 'registrar factura', pending: 'Genera la cuenta por pagar', histo: 'registró la factura del proveedor',
    intro: 'Registra la factura que envió el proveedor. Se valida contra la orden y la recepción, y se crea la cuenta por pagar.',
    submit: 'Registrar factura',
    fields: o => [
      { k: 'num', label: 'Serie y número', value: '', placeholder: 'Ej. F002-08812', required: true },
      { k: 'fe', label: 'Fecha de emisión', type: 'date', value: today(), required: true },
      { k: 'fv', label: 'Fecha de vencimiento', type: 'date', value: isoDate(dueFromTerm(o.party.terms)), required: true },
      { k: 'mon', label: 'Monto de la factura (S/)', type: 'number', value: orderTotal(o).toFixed(2), required: true },
      { k: 'val', label: 'Validación', type: 'select', options: ['Coincide con OC y recepción', 'Con diferencias'], value: 'Coincide con OC y recepción' },
    ],
    note: o => `Validación de 3 vías: orden de compra (${formatMoney(orderTotal(o))}) = recepción = factura.`,
    meta: () => 'Validada contra OC y recepción',
    doneMsg: o => `${o.docs[3]} registrada. Cuenta por pagar creada.`,
    apply: (_d, _o, v) => {
      return { doc: 'Factura ' + v.num };
    },
  },
  {
    title: 'Pago', action: 'Registrar pago', verb: 'pagar', pending: 'Cierra la cuenta por pagar', histo: 'registró el pago al proveedor',
    intro: 'Registra el pago al proveedor. Cierra la cuenta por pagar.',
    submit: 'Registrar pago',
    fields: (o, d, v) => {
      const saldo = Number(findPayable(d, o)?.saldo ?? orderTotal(o));
      const accounts = bankAccounts(d);
      return [
        { k: 'fp', label: 'Fecha de pago', type: 'date', value: today(), required: true },
        { k: 'mon', label: 'Monto pagado (S/)', type: 'number', value: saldo.toFixed(2), required: true },
        { k: 'med', label: 'Medio de pago', type: 'select', options: ['Transferencia', 'Cheque', 'Efectivo'], value: accounts.length ? 'Transferencia' : 'Efectivo' },
        { k: 'cta', label: 'Cuenta origen', type: 'select', options: v.med === 'Efectivo' ? ['Caja'] : accounts.length ? accounts : ['Caja'], value: v.med === 'Efectivo' || !accounts.length ? 'Caja' : accounts[0] },
        { k: 'op', label: 'N.º de operación', value: '', placeholder: 'Ej. 00912744', required: v.med !== 'Efectivo' },
        { k: 'obs', label: 'Observación', value: '' },
      ];
    },
    note: (o, d) => {
      const r = findPayable(d, o);
      const saldo = r ? `Saldo pendiente ${formatMoney(Number(r.saldo))} de ${formatMoney(Number(r.total))}.` : '';
      // Cuenta del proveedor (Mantenimiento › Proveedores): a dónde se transfiere el pago.
      const cuenta = String(d.records.proveedores.find(p => p.razon === o.party.name)?.cuenta ?? '').trim();
      return [saldo, cuenta ? `Cuenta del proveedor: ${cuenta}.` : 'El proveedor no tiene cuenta bancaria registrada.'].filter(Boolean).join(' ');
    },
    meta: o => `${o.forms[4]?.med ?? ''} · ${o.forms[4]?.cta ?? ''}`,
    doneMsg: o => `${o.docs[4]} registrado. La cuenta por pagar quedó cancelada.`,
    apply: (d, o) => {
      const r = findPayable(d, o);
      // El pago ya se registró en el servidor (OrderPage -> payRemote); aquí solo se lee el saldo resultante.
      const left = Number(r?.saldo ?? 0);
      if (left > 0) return { stay: `Pago parcial registrado. Saldo pendiente: ${formatMoney(left)}.` };
      return { doc: 'Pago ' + nextCode(d, `PG-${year()}-`, 4) };
    },
  },
];

export const STEPS: Record<Order['kind'], StepDef[]> = { venta: SALE_STEPS, compra: PURCHASE_STEPS };

const SALE_STATUS: [string, Tone][] = [['Por confirmar', 'blue'], ['Confirmada · por despachar', 'amber'], ['Despachada · por facturar', 'amber'], ['Facturada · por cobrar', 'blue'], ['Cobrada · completada', 'green']];
const PURCHASE_STATUS: [string, Tone][] = [['Por aprobar', 'amber'], ['Aprobada · por recibir', 'blue'], ['Recibida · por facturar', 'blue'], ['Facturada · por pagar', 'amber'], ['Pagada · completada', 'green']];

export function orderStatus(o: Order): [string, Tone] {
  if (o.cancelled) return ['Anulada', 'muted'];
  return (o.kind === 'venta' ? SALE_STATUS : PURCHASE_STATUS)[Math.max(0, o.done - 1)];
}

/** Short status used in the sales list. */
export function saleListStatus(d: DB, o: Order): 'Pagado' | 'Pendiente' | 'Vencido' | 'Anulado' {
  if (o.cancelled) return 'Anulado';
  if (o.done >= 5) return 'Pagado';
  const r = findReceivable(d, o);
  if (r && Number(r.saldo) <= 0) return 'Pagado';
  // Sample orders have no receivable row; their due date lives in the invoice step's form.
  const due = parseDate(r ? String(r.vence) : o.forms[3]?.fv);
  if (due && due < new Date(new Date().toDateString())) return 'Vencido';
  return 'Pendiente';
}

/** Short status used in the purchase-order list. */
export function purchaseListStatus(o: Order): string {
  if (o.cancelled) return 'Anulada';
  return ['Por aprobar', 'Aprobada', 'Recibida', 'Facturada', 'Pagada'][Math.max(0, o.done - 1)];
}

export function partyFromClient(c: Row): OrderParty {
  return { code: String(c.cod ?? ''), name: String(c.razon), ruc: String(c.ndoc ?? ''), contact: [c.contacto, c.tel].filter(Boolean).join(' · '), terms: String(c.cond || 'Contado'), address: String(c.dir ?? ''), email: String(c.correo ?? '') };
}
export function partyFromSupplier(p: Row): OrderParty {
  return { code: String(p.cod ?? ''), name: String(p.razon), ruc: String(p.ruc ?? ''), contact: [p.contacto, p.tel].filter(Boolean).join(' · '), terms: String(p.cond || 'Contado'), address: String(p.dir ?? ''), email: String(p.correo ?? '') };
}

/** Creates an order with its first step (quotation / request, or direct) already completed. */
export function createOrder(d: DB, input: { kind: Order['kind']; party: OrderParty; lines: OrderLine[]; warehouse: string; origin?: string; seller?: string }): Order {
  const me = currentUser(d);
  const o: Order = {
    kind: input.kind,
    code: nextCode(d, `${input.kind === 'venta' ? 'OV' : 'OC'}-${year()}-`, 4),
    createdAt: new Date().toISOString(),
    party: input.party,
    lines: input.lines,
    warehouse: input.warehouse,
    done: 1,
    forms: {},
    docs: { 0: input.origin ?? (input.kind === 'venta' ? 'Venta directa' : 'Compra directa') },
    log: { 0: { who: input.seller ?? me.name, at: new Date().toISOString() } },
    origin: input.origin,
    seller: input.seller ?? me.name,
    igvRate: igvRate(d),
  };
  d.orders.unshift(o);
  audit(d, { action: 'Crear', module: input.kind === 'venta' ? 'Ventas' : 'Compras', ref: o.code, desc: `${input.kind === 'venta' ? 'Orden de venta' : 'Orden de compra'} · ${o.party.name}`, changes: [['Total', '—', formatMoney(orderTotal(o))], ['Estado', '—', orderStatus(o)[0]]] });
  return o;
}

/**
 * Completes the next step of an order with the submitted form values,
 * applying its effects on stock, documents and finance. Call inside update().
 */
export function completeStep(d: DB, code: string, values: Record<string, string>): { error?: string; stay?: string } {
  const o = d.orders.find(x => x.code === code);
  if (!o || o.cancelled || o.done >= 5) return { error: 'La orden ya no admite cambios.' };
  const i = o.done;
  const def = STEPS[o.kind][i];
  const res = def.apply?.(d, o, values) ?? {};
  if (res.error) return { error: res.error };
  o.forms[i] = { ...values };
  if (res.stay) {
    audit(d, { action: 'Editar', module: o.kind === 'venta' ? 'Ventas' : 'Compras', ref: o.code, desc: res.stay });
    return { stay: res.stay };
  }
  const before = orderStatus(o)[0];
  o.done = i + 1;
  o.docs[i] = res.doc ?? '';
  o.log[i] = { who: currentUser(d).name, at: new Date().toISOString() };
  audit(d, { action: 'Editar', module: o.kind === 'venta' ? 'Ventas' : 'Compras', ref: o.code, desc: `${def.title}: ${o.docs[i]}`, changes: [['Estado', before, orderStatus(o)[0]]] });
  return {};
}

/** Order effects shown in "Impacto en otros módulos". */
export function orderEffects(o: Order): { module: string; text: string; ref: string; at: number }[] {
  const total = formatMoney(orderTotal(o));
  const qty = o.lines.map(l => l.qty.toLocaleString('en-US'));
  if (o.kind === 'venta')
    return [
      { module: 'Mantenimiento', text: 'Usa cliente y productos registrados (precios de lista)', ref: `${o.party.code || o.party.name} · ${o.lines.length} producto${o.lines.length === 1 ? '' : 's'}`, at: 0 },
      { module: 'Ventas', text: 'Reserva de stock para la orden', ref: `${units(o).toLocaleString('en-US')} unidades reservadas en ${o.warehouse}`, at: 1 },
      { module: 'Inventario', text: 'Salida de almacén y movimiento en kardex', ref: `${o.docs[2] || 'Guía'} · ${qty.map(q => '−' + q).join(' / ')}`, at: 2 },
      { module: 'Documentos', text: 'Guía de remisión electrónica', ref: o.docs[2] ? `${o.docs[2].replace('Guía ', 'Guia_')}.pdf` : 'Se genera al despachar', at: 2 },
      { module: 'Finanzas', text: 'Cuenta por cobrar', ref: `CxC ${total}`, at: 3 },
      { module: 'Finanzas', text: 'Ingreso a bancos o caja y cierre de la cuenta por cobrar', ref: total, at: 4 },
    ];
  return [
    { module: 'Mantenimiento', text: 'Usa proveedor y productos registrados (costos pactados)', ref: `${o.party.code || o.party.name} · ${o.lines.length} producto${o.lines.length === 1 ? '' : 's'}`, at: 0 },
    { module: 'Compras', text: 'Compromiso de compra con el proveedor', ref: o.forms[1]?.ent ? `Entrega pactada ${fmtDate(parseDate(o.forms[1].ent)!)}` : 'Al aprobar', at: 1 },
    { module: 'Inventario', text: 'Ingreso a almacén y movimiento en kardex', ref: `${o.docs[2] || 'Nota de ingreso'} · ${qty.map(q => '+' + q).join(' / ')}`, at: 2 },
    { module: 'Inventario', text: 'Actualiza costo promedio de los productos', ref: `${o.lines.length} producto${o.lines.length === 1 ? '' : 's'}`, at: 2 },
    { module: 'Finanzas', text: 'Cuenta por pagar', ref: `CxP ${total}`, at: 3 },
    { module: 'Finanzas', text: 'Egreso de bancos o caja y cierre de la cuenta por pagar', ref: total, at: 4 },
  ];
}

/** Credit usage for the order's party. */
export function partyCredit(d: DB, o: Order): { label: string; text: string; pct: number; over: boolean } {
  if (o.kind === 'venta') {
    const c = d.records.clientes.find(x => x.razon === o.party.name);
    const limit = Number(c?.linea ?? 0);
    const open = d.records.cxc.filter(r => r.cliente === o.party.name && r.estado !== 'Cobrada').reduce((a, r) => a + Number(r.saldo), 0);
    const pending = !o.cancelled && o.done >= 2 && o.done < 4 ? orderTotal(o) : 0;
    const used = open + pending;
    if (!limit) return { label: 'Línea de crédito', text: 'Sin línea · contado', pct: 0, over: false };
    return { label: 'Línea de crédito usada', text: `S/ ${Math.round(used).toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`, pct: Math.min(100, (used / limit) * 100), over: used / limit > 0.8 };
  }
  const owed = d.records.cxp.filter(r => r.prov === o.party.name && r.estado !== 'Pagada').reduce((a, r) => a + Number(r.saldo), 0);
  return { label: 'Deuda pendiente con el proveedor', text: formatMoney(owed), pct: 0, over: false };
}

/** Cancels an order before stock moves, releasing reservations. */
export function cancelOrder(d: DB, code: string) {
  const o = d.orders.find(x => x.code === code);
  if (!o || o.cancelled) return;
  if (o.kind === 'venta' && o.done === 2) o.lines.forEach(l => moveStock(d, { sku: l.sku, name: l.name, alm: o.warehouse, delta: 0, reserve: -l.qty }));
  o.cancelled = true;
  audit(d, { action: 'Editar', module: o.kind === 'venta' ? 'Ventas' : 'Compras', ref: o.code, desc: 'Orden anulada', changes: [['Estado', orderStatus({ ...o, cancelled: false })[0], 'Anulada']] });
}

/** Whether the order can still be cancelled (no stock has moved yet). */
export const canCancel = (o: Order) => !o.cancelled && o.done < 3;

export { termDays };

/**
 * When a receivable/payable linked to an order is fully settled from Finanzas,
 * close the order's last step too so both screens agree.
 */
export function syncOrderSettlement(d: DB, row: Row, p: { medio: string; cuenta: string; op: string }) {
  const o = d.orders.find(x => x.code === row.orden);
  if (!o || o.cancelled || o.done !== 4 || Number(row.saldo) > 0) return;
  o.forms[4] = { [o.kind === 'venta' ? 'fc' : 'fp']: isoDate(new Date()), mon: String(row.total), med: p.medio, cta: p.cuenta || 'Caja', op: p.op, obs: 'Registrado desde Finanzas' };
  o.docs[4] = (o.kind === 'venta' ? 'Cobro ' : 'Pago ') + nextCode(d, `${o.kind === 'venta' ? 'CB' : 'PG'}-${year()}-`, 4);
  o.log[4] = { who: currentUser(d).name, at: new Date().toISOString() };
  o.done = 5;
}