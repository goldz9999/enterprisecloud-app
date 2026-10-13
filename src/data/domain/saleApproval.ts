import { getDB, mutate } from '../store';
import { loadInventory } from './inventory';
import { loadReceivables } from './finance';
import { completeStep, payExpired, STEPS } from './orders';
import { completeSaleStepRemote } from './salesOrders';

export type ApproveResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Aprueba una orden de venta directa: confirma (reserva), despacha (guía de remisión + salida de stock) y
 * emite el comprobante (crea la cuenta por cobrar). Cada paso usa los datos que se capturaron al crear la
 * orden (cliente, transporte, conductor, placa, fecha y dirección). El cobro se registra en Finanzas.
 *
 * El servidor valida cada paso; si uno falla (p. ej. stock insuficiente) los anteriores quedan registrados
 * y la orden sigue en el paso donde se detuvo, por lo que se puede corregir y volver a aprobar.
 */
export async function approveSaleOrder(code: string): Promise<ApproveResult> {
  const steps = STEPS.venta;
  for (let guard = 0; guard < 4; guard++) {
    const o = getDB().orders.find(x => x.kind === 'venta' && x.code === code);
    if (!o) return { ok: false, error: 'La orden ya no existe.' };
    if (o.cancelled) return { ok: false, error: 'La orden está anulada.' };
    if (payExpired(o)) return { ok: false, error: `La orden venció el ${o.forms[0]?.lim} por falta de pago y se anula sola. Crea una nueva orden.` };
    if (o.done >= 4) break; // comprobante emitido: lo que sigue es el cobro (Finanzas)

    const step = steps[o.done];
    const fields = step.fields(o, getDB(), {});
    const missing = fields.find(f => f.required && !String(f.value ?? '').trim());
    if (missing) return { ok: false, error: `${step.title}: falta «${missing.label}». Completa el dato en Mantenimiento (cliente, conductor o vehículo) y vuelve a aprobar.` };

    const values = Object.fromEntries(fields.map(f => [f.k, String(f.value ?? '')]));
    const remote = await completeSaleStepRemote(code, values);
    if (!remote.ok) return { ok: false, error: `${step.title}: ${remote.error}` };

    // Efectos locales (documentos generados, comprobantes) y datos que devolvió el servidor, igual que al avanzar un paso.
    mutate(draft => {
      const local = draft.orders.find(x => x.kind === 'venta' && x.code === code);
      if (local && !local.cancelled && local.done === o.done) completeStep(draft, code, values);
      const i = draft.orders.findIndex(x => x.kind === 'venta' && x.code === code);
      if (i >= 0) {
        draft.orders[i] = {
          ...draft.orders[i],
          done: remote.order.done,
          forms: { ...draft.orders[i].forms, ...remote.order.forms },
          docs: { ...draft.orders[i].docs, ...remote.order.docs },
          log: { ...draft.orders[i].log, ...remote.order.log },
          cancelled: remote.order.cancelled,
          warehouse: remote.order.warehouse || draft.orders[i].warehouse,
          party: { ...draft.orders[i].party, ...remote.order.party },
        };
      }
      return undefined;
    });
  }
  await Promise.all([loadReceivables(), loadInventory()]);
  const done = getDB().orders.find(x => x.kind === 'venta' && x.code === code);
  const docs = [done?.docs[2], done?.docs[3]].filter(Boolean).join(' · ');
  return { ok: true, message: `${code} aprobada${docs ? ` · ${docs}` : ''}` };
}
