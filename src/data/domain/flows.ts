import type { FlowItem, FlowRow } from '@/shared/components/flow-list/types';
import { displayDate, fmtDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { currentUser, nextCode } from '../store';
import type { DB, OrderLine } from '../types';
import { audit } from './audit';
import { createOrder, partyFromClient, partyFromSupplier, warehouses } from './orders';
import { productByName, productBySku } from './stock';

export type FlowKind = 'cotizacion' | 'solicitud';

const listOf = (d: DB, kind: FlowKind) => (kind === 'cotizacion' ? d.cotizaciones : d.solicitudes);
const moduleOf = (kind: FlowKind) => (kind === 'cotizacion' ? 'Ventas' : 'Compras');
const label = (kind: FlowKind) => (kind === 'cotizacion' ? 'Cotización' : 'Solicitud de compra');

export function flowTotal(items: FlowItem[]): number {
  return items.reduce((a, i) => a + i.qty * i.price, 0) * 1.18;
}

/** Form values of a quotation (cliente, vendedor, valida, cond, alm) or request (solicitante, area, motivo, prioridad, req, alm, prov). */
export type FlowData = Record<string, string>;

/** Display fields derived from the structured data. */
function present(d: DB, kind: FlowKind, data: FlowData): Pick<FlowRow, 'party' | 'partySub' | 'facts'> {
  if (kind === 'cotizacion') {
    const c = d.records.clientes.find(x => x.razon === data.cliente);
    return {
      party: data.cliente,
      partySub: c ? `${c.tdoc ?? 'RUC'} ${c.ndoc}` : '',
      facts: [
        { k: 'Vendedor', v: data.vendedor },
        { k: 'Válida hasta', v: displayDate(data.valida) },
        { k: 'Condición', v: data.cond },
        { k: 'Entrega', v: data.alm },
      ],
    };
  }
  return {
    party: data.solicitante,
    partySub: `${data.area} · ${data.motivo}`,
    facts: [
      { k: 'Prioridad', v: data.prioridad },
      { k: 'Requerido para', v: displayDate(data.req) },
      { k: 'Almacén destino', v: data.alm },
      { k: 'Proveedor sugerido', v: data.prov || '—' },
    ],
  };
}

export function saveFlowDoc(d: DB, kind: FlowKind, data: FlowData, items: FlowItem[], id?: string): string {
  const list = listOf(d, kind);
  if (id) {
    const row = list.find(r => r.id === id);
    if (!row) return id;
    Object.assign(row, present(d, kind, data), { data, items });
    audit(d, { action: 'Editar', module: moduleOf(kind), ref: id, desc: `${label(kind)} actualizada · ${formatMoney(flowTotal(items))}` });
    return id;
  }
  const code = nextCode(d, `${kind === 'cotizacion' ? 'COT' : 'SOL'}-${new Date().getFullYear()}-`, 4);
  list.unshift({ id: code, date: fmtDate(new Date()), status: kind === 'cotizacion' ? 'Borrador' : 'Pendiente', items, data, ...present(d, kind, data) });
  audit(d, { action: 'Crear', module: moduleOf(kind), ref: code, desc: `${label(kind)} · ${kind === 'cotizacion' ? data.cliente : data.motivo}`, changes: [['Total', '—', formatMoney(flowTotal(items))]] });
  return code;
}

export function setFlowStatus(d: DB, kind: FlowKind, id: string, status: string) {
  const row = listOf(d, kind).find(r => r.id === id);
  if (!row) return;
  audit(d, { action: 'Editar', module: moduleOf(kind), ref: id, desc: `${label(kind)}: ${status}`, changes: [['Estado', row.status, status]] });
  row.status = status;
}

export function deleteFlowDoc(d: DB, kind: FlowKind, id: string) {
  if (kind === 'cotizacion') d.cotizaciones = d.cotizaciones.filter(r => r.id !== id);
  else d.solicitudes = d.solicitudes.filter(r => r.id !== id);
  audit(d, { action: 'Eliminar', module: moduleOf(kind), ref: id, desc: `${label(kind)} eliminada` });
}

export function duplicateFlowDoc(d: DB, kind: FlowKind, id: string): string | undefined {
  const row = listOf(d, kind).find(r => r.id === id);
  if (!row) return;
  return saveFlowDoc(d, kind, dataOf(d, kind, row), structuredClone(row.items));
}

/** Structured data for a row; sample rows only have display facts, so derive it from them. */
export function dataOf(d: DB, kind: FlowKind, row: FlowRow): FlowData {
  if (row.data) return { ...row.data };
  const fact = (k: string) => row.facts.find(f => f.k === k)?.v ?? '';
  const whs = warehouses(d);
  const wh = (v: string) => (whs.includes(v) ? v : String(d.settings.almdef && whs.includes(String(d.settings.almdef)) ? d.settings.almdef : whs[0]));
  if (kind === 'cotizacion') {
    const c = d.records.clientes.find(x => x.razon === row.party);
    return { cliente: row.party, vendedor: fact('Vendedor') || currentUser(d).name, valida: fact('Válida hasta'), cond: fact('Condición') || String(c?.cond ?? 'Contado'), alm: wh(fact('Entrega')) };
  }
  const [area, ...motivo] = row.partySub.split(' · ');
  const suggested = fact('Proveedor sugerido');
  const prov = d.records.proveedores.find(p => String(p.razon).startsWith(suggested.replace(/\.$/, '')))?.razon;
  return { solicitante: row.party, area, motivo: motivo.join(' · '), prioridad: fact('Prioridad') || 'Media', req: fact('Requerido para'), alm: wh(fact('Almacén destino')), prov: String(prov ?? suggested ?? '') };
}

function toLines(d: DB, items: FlowItem[]): OrderLine[] {
  return items.map(i => {
    const p = (i.sku && productBySku(d, i.sku)) || productByName(d, i.name);
    return { sku: String(p?.sku ?? i.sku ?? i.name), name: String(p?.nombre ?? i.name), unit: i.unit, qty: i.qty, price: i.price };
  });
}

/**
 * Turns an approved quotation into a sales order, or an approved request into a purchase order.
 * Returns the new order's code, or an error message.
 */
export function convertToOrder(d: DB, kind: FlowKind, id: string): { code?: string; error?: string } {
  const row = listOf(d, kind).find(r => r.id === id);
  if (!row) return { error: 'El documento ya no existe.' };
  const data = dataOf(d, kind, row);
  if (kind === 'cotizacion') {
    const c = d.records.clientes.find(x => x.razon === data.cliente);
    if (!c) return { error: `El cliente ${data.cliente} no está registrado en Mantenimiento › Clientes.` };
    const party = { ...partyFromClient(c), terms: data.cond || String(c.cond) };
    const o = createOrder(d, { kind: 'venta', party, lines: toLines(d, row.items), warehouse: data.alm, origin: row.id, seller: data.vendedor });
    row.status = 'Convertida';
    row.order = o.code;
    return { code: o.code };
  }
  const p = d.records.proveedores.find(x => x.razon === data.prov) ?? d.records.proveedores.find(x => x.estado !== 'Inactivo');
  if (!p) return { error: 'Registra al menos un proveedor en Mantenimiento › Proveedores.' };
  const o = createOrder(d, { kind: 'compra', party: partyFromSupplier(p), lines: toLines(d, row.items), warehouse: data.alm, origin: row.id, seller: currentUser(d).name });
  row.status = 'Atendida';
  row.order = o.code;
  return { code: o.code };
}
