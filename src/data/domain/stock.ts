import { fmtDayTime } from '@/shared/lib/dates';
import { currentUser, nextId } from '../store';
import type { DB, Row } from '../types';

/** Stock status relative to the product's minimum. */
export function stockStatus(stock: number, min: number): string {
  if (stock <= 0) return 'Sin stock';
  if (min > 0 && stock < min) return 'Bajo mínimo';
  if (min > 0 && stock > min * 3) return 'Sobrestock';
  return 'Normal';
}

export function productBySku(d: DB, sku: string): Row | undefined {
  return d.records.productos.find(p => p.sku === sku);
}

export function productByName(d: DB, name: string): Row | undefined {
  return d.records.productos.find(p => p.nombre === name);
}

export function stockRow(d: DB, sku: string, alm: string): Row | undefined {
  return d.records.stock.find(s => s.sku === sku && s.alm === alm);
}

/** Units available to sell in a warehouse (stock minus reserved). */
export function available(d: DB, sku: string, alm: string): number {
  const r = stockRow(d, sku, alm);
  return r ? Number(r.stock) - Number(r.res) : 0;
}

interface Movement {
  sku: string;
  /** Used when the product is not in the catalog. */
  name?: string;
  alm: string;
  /** Change in physical stock (+ in, − out). */
  delta: number;
  /** Change in reserved units. */
  reserve?: number;
  tipo?: 'Entrada' | 'Salida' | 'Transferencia' | 'Ajuste';
  doc?: string;
  costo?: number;
}

/**
 * Moves stock in a warehouse, creating the stock row if needed, recalculating its status,
 * and recording a kardex movement when physical stock changes. Call inside update().
 */
export function moveStock(d: DB, m: Movement): Row {
  const prod = productBySku(d, m.sku);
  let row = stockRow(d, m.sku, m.alm);
  if (!row) {
    row = {
      _id: nextId(d.records.stock),
      sku: m.sku,
      prod: String(prod?.nombre ?? m.name ?? m.sku),
      cat: String(prod?.cat ?? '—'),
      alm: m.alm,
      stock: 0,
      min: Number(prod?.min ?? 0),
      res: 0,
      estado: 'Sin stock',
    };
    d.records.stock.unshift(row);
  }
  row.stock = Number(row.stock) + m.delta;
  row.res = Math.max(0, Number(row.res) + (m.reserve ?? 0));
  row.estado = stockStatus(Number(row.stock), Number(row.min));
  if (m.delta !== 0) {
    d.records.kardex.unshift({
      _id: nextId(d.records.kardex),
      fecha: fmtDayTime(new Date()),
      at: new Date().toISOString(),
      sku: m.sku,
      prod: row.prod,
      alm: m.alm,
      tipo: m.tipo ?? (m.delta > 0 ? 'Entrada' : 'Salida'),
      doc: m.doc ?? '—',
      cant: m.delta,
      saldo: row.stock,
      costo: m.costo ?? Number(prod?.costo ?? 0),
      resp: currentUser(d).name,
    });
  }
  return row;
}

/** Updates a product's weighted average cost after receiving `qty` units at `unitCost`. */
export function updateAverageCost(d: DB, sku: string, qty: number, unitCost: number) {
  const prod = productBySku(d, sku);
  if (!prod || qty <= 0) return;
  const onHand = d.records.stock.filter(s => s.sku === sku).reduce((a, s) => a + Number(s.stock), 0) - qty;
  const prev = Number(prod.costo) || unitCost;
  const total = Math.max(0, onHand) * prev + qty * unitCost;
  prod.costo = Math.round((total / (Math.max(0, onHand) + qty)) * 100) / 100;
}
