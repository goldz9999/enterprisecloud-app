import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinesEditor } from '../components/LinesEditor';
import { Combobox } from '../components/Combobox';
import { PartyPicker, type PartyOption } from '../components/PartyPicker';
import { OWN_FLEET } from '../data/domain/carriers';
import { productUuidBySku, supplierCost, userUuidByName, warehouseIdByName } from '../data/domain/masters';
import { dataOf } from '../data/domain/flows';
import { stockRow } from '../data/domain/stock';
import { convertQuotationRemote } from '../data/domain/quotations';
import type { FlowRow } from '../features/flowlist/types';
import { igvRate, orderSubtotal, orderTotal, partyFromClient, partyFromSupplier, payTermOptions, warehouses } from '../data/domain/orders';
import { createPurchaseOrderRemote } from '../data/domain/purchaseOrders';
import { createSaleOrderRemote } from '../data/domain/salesOrders';
import { currentUser, getDB, useDB } from '../data/store';
import type { Order, OrderLine, Row } from '../data/types';
import { addDays, displayDate, isoDate } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { linesError } from '../lib/lines';
import './ComprasPage.css';

interface Props {
  kind: Order['kind'];
  onClose: () => void;
  /** Se llama con la orden ya guardada en el servidor; el modal no navega a ninguna otra pantalla. */
  onCreated: (order: Order) => void;
  /** Cotización aprobada que se convierte: precarga productos, precios, almacén y condición; al guardar queda «Convertida». */
  quote?: FlowRow;
  /** Compras desde Stock bajo mínimo: producto y almacén con los que arranca la orden. */
  restock?: { sku: string; alm?: string };
}

/**
 * Ventana ancha para crear una orden de compra o de venta sin salir de la lista: formulario a la izquierda y resumen a la derecha.
 * Compras: proveedor + almacén destino + productos. Ventas: cliente, entrega y condiciones + productos.
 * La orden de compra no pide aprobación al crearse: queda lista para recepción en Kardex.
 */
export function OrderCreateModal({ kind, onClose, onCreated, quote, restock }: Props) {
  const d = useDB();
  const qData = quote ? dataOf(d, 'cotizacion', quote) : undefined;
  const sale = kind === 'venta';
  const parties = (sale ? d.records.clientes : d.records.proveedores).filter(p => p.estado !== 'Inactivo');
  const whs = warehouses(d);
  const rate = igvRate(d);

  // Lo elegido por el usuario; si aún no eligió (o los datos llegaron después del primer render) se usa la primera opción real.
  const [pickedParty, setPickedParty] = useState<number | ''>('');
  const [pickedWarehouse, setPickedWarehouse] = useState(qData?.alm ?? restock?.alm ?? '');
  // Transporte: «Nuestras movilidades» (flota de la empresa, con conductor y vehículo) o «Movilidad propia» (la lleva el cliente).
  const [transport, setTransport] = useState<'fleet' | 'client'>('fleet');
  const [pickedDriver, setPickedDriver] = useState('');
  const [pickedPlate, setPickedPlate] = useState('');
  const [pickedTerms, setPickedTerms] = useState(qData?.cond ?? '');
  const [deliveryDate, setDeliveryDate] = useState(() => isoDate(addDays(new Date(), 3)));
  // Al contado: fecha límite de pago; si no se aprueba y paga hasta ese día, la orden se anula sola.
  const [payDeadline, setPayDeadline] = useState(() => isoDate(addDays(new Date(), 1)));
  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (restock) {
      // Reponer: el doble del mínimo menos lo que hay en ese almacén (al menos 1).
      const p = d.records.productos.find(x => x.sku === restock.sku);
      if (!p) return [];
      const st = restock.alm ? stockRow(d, restock.sku, restock.alm) : undefined;
      const qty = Math.max(1, Number(p.min) * 2 - Number(st?.stock ?? 0));
      return [{ sku: String(p.sku), name: String(p.nombre), unit: String(p.unidad).toLowerCase(), qty, price: Number(p.costo) || 0 }];
    }
    return (quote?.items ?? []).map(i => {
      const p = d.records.productos.find(x => x.sku === i.sku || x.nombre === i.name);
      return { sku: String(p?.sku ?? i.sku ?? i.name), name: String(p?.nombre ?? i.name), unit: i.unit, qty: i.qty, price: i.price };
    });
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const partyId = parties.some(p => p._id === pickedParty) ? pickedParty : sale ? '' : (parties[0]?._id ?? '');
  const party = parties.find(p => p._id === partyId);
  const partyName = String(party?.razon ?? '');
  const defaultWarehouse = d.settings.almdef && whs.includes(String(d.settings.almdef)) ? String(d.settings.almdef) : whs[0];
  const warehouse = whs.includes(pickedWarehouse) ? pickedWarehouse : defaultWarehouse;
  // Flota propia: conductores y vehículos activos de la empresa. Elegir uno trae al otro (el vehículo guarda su conductor habitual).
  const fleetDrivers = d.records.conductores.filter(c => c.estado === 'Activo' && c.empresa === OWN_FLEET);
  const fleetVehicles = d.records.vehiculos.filter(v => v.estado === 'Activo' && v.empresa === OWN_FLEET);
  const driverOf = (v: Row | undefined) => String(v?.conductor ?? '').split(' · ')[0];
  const driver = pickedDriver && fleetDrivers.some(c => c.nombre === pickedDriver) ? pickedDriver : '';
  const plate = pickedPlate && fleetVehicles.some(v => v.placa === pickedPlate) ? pickedPlate : '';
  const pickDriver = (name: string) => {
    setPickedDriver(name);
    const v = fleetVehicles.find(x => name && driverOf(x) === name);
    if (v) setPickedPlate(String(v.placa));
  };
  const pickPlate = (p: string) => {
    setPickedPlate(p);
    const name = driverOf(fleetVehicles.find(x => x.placa === p));
    if (name && fleetDrivers.some(c => c.nombre === name)) setPickedDriver(name);
  };
  const needsFleet = transport === 'fleet' && fleetDrivers.length > 0 && fleetVehicles.length > 0;
  const carrier = transport === 'fleet' ? OWN_FLEET : 'Retira el cliente';
  const seller = currentUser(d).name;
  const terms = pickedTerms || String(party?.cond || 'Contado');
  const creditDays = Number(/(\d+)/.exec(terms)?.[1] ?? 0);
  const cash = creditDays === 0;
  // La dirección de entrega es la del cliente (Mantenimiento › Clientes); no se vuelve a pedir aquí.
  const address = String(party?.dir ?? '').trim();
  const options: PartyOption[] = parties.map(p => ({
    id: p._id as number,
    name: String(p.razon),
    doc: sale ? [p.tdoc, p.ndoc].filter(Boolean).join(' ') : p.ruc ? `RUC ${p.ruc}` : '',
    code: String(p.cod ?? ''),
    contact: String(p.contacto ?? ''),
    phone: String(p.tel ?? ''),
    email: String(p.correo ?? ''),
    address: String(p.dir ?? ''),
    terms: String(p.cond || 'Contado'),
    credit: sale ? Number(p.linea) || 0 : undefined,
  }));

  const subtotal = orderSubtotal({ lines });
  const total = orderTotal({ lines, igvRate: rate });
  // Crédito del cliente: línea − saldo por cobrar − ventas a crédito aún sin facturar. Una venta a crédito debe caber.
  const creditLimit = Number(party?.linea ?? 0);
  const owed = d.records.cxc.filter(r => r.cliente === partyName && r.estado !== 'Cobrada').reduce((a, r) => a + Number(r.saldo), 0);
  const uninvoiced = d.orders
    .filter(o => o.kind === 'venta' && !o.cancelled && o.done >= 1 && o.done <= 3 && o.party.name === partyName && Number(/(\d+)/.exec(o.party.terms || '')?.[1] ?? 0) > 0)
    .reduce((a, o) => a + orderTotal(o), 0);
  const creditAvailable = creditLimit - owed - uninvoiced;
  const creditError = !sale || cash
    ? ''
    : creditLimit <= 0
      ? 'Este cliente no tiene línea de crédito: la venta debe ser al contado'
      : total > creditAvailable + 0.005
        ? `Supera el crédito disponible (${formatMoney(Math.max(creditAvailable, 0))})`
        : '';
  const units = lines.reduce((a, l) => a + l.qty, 0);
  // Qué falta para poder guardar: se muestra en el resumen en vez de dejar un botón que "no hace nada".
  const missing = !party ? 'Elige un ' + (sale ? 'cliente' : 'proveedor') : !lines.length ? 'Agrega al menos un producto' : creditError ? creditError : sale && needsFleet && (!driver || !plate) ? 'Elige conductor y vehículo' : '';

  // Esc cierra el modal, salvo mientras se guarda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const pickParty = (id: number) => {
    setPickedParty(id);
    if (!quote) setPickedTerms('');
    if (sale) return;
    // Compras: al cambiar de proveedor las líneas toman el costo pactado con ese proveedor (si lo tiene registrado).
    const name = String(parties.find(p => p._id === id)?.razon ?? '');
    setLines(ls => ls.map(l => ({ ...l, price: supplierCost(name, l.sku) ?? l.price })));
  };

  const save = async () => {
    if (!party) return setError(sale ? 'Elige un cliente.' : 'Elige un proveedor.');
    if (creditError) return setError(creditError + '.');
    if (sale && !deliveryDate) return setError('Indica la fecha de entrega.');
    if (sale && cash && !payDeadline) return setError('Indica la fecha límite de pago.');
    if (sale && cash && payDeadline < isoDate(new Date())) return setError('La fecha límite de pago no puede ser anterior a hoy.');
    const le = linesError(lines);
    if (le) return setError(le);
    setSaving(true);
    setError('');
    try {
      if (quote) {
        const termsDays = Number(/(\d+)/.exec(terms)?.[1] ?? 0);
        const res = await convertQuotationRemote(quote.id, Number(party._id), {
          warehouseId: warehouseIdByName(warehouse) || undefined,
          sellerUserId: (qData?.vendedor && userUuidByName(qData.vendedor)) || undefined,
          paymentTermsDays: termsDays,
          carrier,
          driver: transport === 'fleet' ? driver || undefined : undefined,
          vehiclePlate: transport === 'fleet' ? plate || undefined : undefined,
          deliveryDate,
          deliveryAddress: address || undefined,
          payDeadline: cash ? payDeadline : undefined,
          lines: lines.map(l => ({ productId: productUuidBySku(l.sku) || undefined, sku: l.sku, name: l.name, unit: l.unit, quantity: l.qty, unitPrice: l.price })),
        });
        if (!res.ok) return setError(res.error);
        const o = getDB().orders.find(x => x.kind === 'venta' && x.code === res.code);
        if (o) onCreated(o);
        else onClose();
        return;
      }
      const res = sale
        ? await createSaleOrderRemote({
          party: { ...partyFromClient(party), terms },
          lines,
          warehouse,
          seller,
          customerLocalId: Number(party._id),
          carrier,
          driver: transport === 'fleet' ? driver : undefined,
          vehiclePlate: transport === 'fleet' ? plate : undefined,
          deliveryDate,
          deliveryAddress: address,
          payDeadline: cash ? payDeadline : undefined,
        })
        : await createPurchaseOrderRemote({
          party: partyFromSupplier(party),
          lines,
          warehouse,
          seller: currentUser(d).name,
          supplierLocalId: Number(party._id),
        });
      if (!res.ok) return setError(res.error);
      onCreated(res.order);
    } finally {
      setSaving(false);
    }
  };

  const title = quote ? `Orden de venta desde ${quote.id}` : sale ? 'Nueva orden de venta' : 'Nueva orden de compra';
  const submit = sale ? 'Crear orden de venta' : 'Crear orden de compra';
  const emptyNote = sale ? (
    <>Primero registra un cliente en <Link to="/mantenimiento/clientes">Mantenimiento</Link>.</>
  ) : (
    <>Primero registra un proveedor en <Link to="/mantenimiento/proveedores">Mantenimiento</Link>.</>
  );

  return (
    <div className="purchase-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className={'purchase-modal purchase-modal--fixed' + (sale ? ' purchase-modal--order' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="purchase-modal__head">
          <div className="panel__title">{title}</div>
          <button type="button" className="drawer__close" style={{ marginLeft: 'auto', fontSize: 16 }} title="Cerrar" aria-label="Cerrar" disabled={saving} onClick={onClose}>×</button>
        </div>

        {!parties.length ? (
          <div className="purchase-modal__body purchase-modal__body--single">
            <div className="note">{emptyNote}</div>
          </div>
        ) : (
          <div className="purchase-modal__body">
            <div className="purchase-modal__main">
              <section className="om-section">
                <h3 className="om-section__title">{sale ? 'Pago y entrega' : 'Destino'}</h3>
                <div className="purchase-modal__fields">
                  {sale ? (
                    <>
                      <label className="field">
                        <span className="field__label">Condición de pago</span>
                        <select className="field__control" value={terms} onChange={e => setPickedTerms(e.target.value)}>
                          {[...new Set([terms, ...payTermOptions(d)])].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </label>
                      {cash ? (
                        <label className="field">
                          <span className="field__label">Pagar hasta *</span>
                          <input className="field__control" type="date" min={isoDate(new Date())} value={payDeadline} onChange={e => setPayDeadline(e.target.value)} />
                        </label>
                      ) : (
                        <div className="field">
                          <span className="field__label">Vencimiento del cobro</span>
                          <div className="purchase-modal__hint" style={{ lineHeight: '36px' }}>{creditDays} días desde el comprobante</div>
                        </div>
                      )}
                      <label className="field">
                        <span className="field__label">Fecha de entrega *</span>
                        <input className="field__control" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                      </label>
                      <div className="field">
                        <span className="field__label">Almacén de despacho</span>
                        <Combobox ariaLabel="Almacén de despacho" value={warehouse} options={whs.map(w => ({ value: w, label: w }))} onChange={setPickedWarehouse} />
                      </div>
                      <p className="purchase-modal__hint purchase-modal__wide om-terms-hint">
                        {cash
                          ? 'Al contado: si la orden no se aprueba y paga hasta esa fecha, se anula sola.'
                          : creditLimit > 0
                            ? `Crédito ${creditDays} días. Disponible ${formatMoney(Math.max(creditAvailable, 0))} de una línea de ${formatMoney(creditLimit)}. Si no paga queda «Vencido» en Cuentas por cobrar (no se anula).`
                            : 'Este cliente no tiene línea de crédito: solo se le puede vender al contado.'}
                      </p>
                      <div className="om-transport purchase-modal__wide">
                        <label className="field">
                          <span className="field__label">Transporte</span>
                          <select className="field__control" value={transport} onChange={e => setTransport(e.target.value as 'fleet' | 'client')}>
                            <option value="fleet">Nuestras movilidades</option>
                            <option value="client">Movilidad propia (cliente)</option>
                          </select>
                        </label>
                        {transport === 'fleet' && (fleetDrivers.length > 0 || fleetVehicles.length > 0) && (
                          <>
                            <div className="field">
                              <span className="field__label">Conductor *</span>
                              <Combobox ariaLabel="Conductor" placeholder="Buscar conductor…" value={driver} options={fleetDrivers.map(c => ({ value: String(c.nombre), label: String(c.nombre) }))} onChange={pickDriver} />
                            </div>
                            <div className="field">
                              <span className="field__label">Vehículo (placa) *</span>
                              <Combobox ariaLabel="Vehículo" mono placeholder="Buscar placa…" value={plate} options={fleetVehicles.map(v => ({ value: String(v.placa), label: String(v.placa), hint: v.tipo ? String(v.tipo) : undefined }))} onChange={pickPlate} />
                            </div>
                          </>
                        )}
                      </div>
                      {transport === 'fleet' && !fleetDrivers.length && !fleetVehicles.length && (
                        <p className="purchase-modal__hint purchase-modal__wide">No hay conductores ni vehículos propios registrados. Regístralos en <Link to="/mantenimiento/conductores">Mantenimiento</Link>; también puedes indicarlos al despachar.</p>
                      )}
                    </>
                  ) : (
                    <label className="field">
                      <span className="field__label">Almacén destino</span>
                      <select className="field__control" value={warehouse} onChange={e => setPickedWarehouse(e.target.value)}>
                        {whs.map(w => <option key={w}>{w}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </section>

              <section className="om-section om-section--lines">
                <h3 className="om-section__title">
                  Productos
                  {lines.length > 0 && <span className="om-count">{lines.length}</span>}
                </h3>
                <LinesEditor
                  lines={lines}
                  onChange={setLines}
                  priceFrom={sale ? 'precio' : 'costo'}
                  warehouse={sale ? warehouse : undefined}
                  igvRate={rate}
                  priceLabel={sale ? 'P. unit.' : 'Costo unit.'}
                  costFor={sale ? undefined : sku => supplierCost(partyName, sku)}
                  showTotals={false}
                  emptyHint={sale ? 'Agrega los productos que se venden. El precio y la disponibilidad salen del catálogo.' : 'Agrega los productos que compras. El costo sale del precio pactado con el proveedor.'}
                />
              </section>

              {error && <div className="drawer-error" role="alert">{error}</div>}
            </div>

            <aside className="purchase-modal__aside" aria-label="Resumen de la orden">
              <section className="om-aside-party">
                <h3 className="purchase-modal__label">{sale ? 'Cliente' : 'Proveedor'}</h3>
                <PartyPicker compact noun={sale ? 'Cliente' : 'Proveedor'} options={options} value={partyId} onChange={id => pickParty(Number(id))} />
              </section>

              <div className="purchase-modal__label">Resumen</div>
              <dl className="om-facts">
                {sale && <div><dt>Entrega</dt><dd>{deliveryDate ? displayDate(deliveryDate) : '—'}</dd></div>}
                <div><dt>{sale ? 'Despacho desde' : 'Ingresa a'}</dt><dd>{warehouse || '—'}</dd></div>
                {sale && <div><dt>Transporte</dt><dd>{transport === 'client' ? 'Lo lleva el cliente' : [driver, plate].filter(Boolean).join(' · ') || 'Nuestras movilidades'}</dd></div>}
                <div><dt>Productos</dt><dd>{lines.length ? `${lines.length} · ${units.toLocaleString('en-US')} und.` : '—'}</dd></div>
                {sale && !cash && <div><dt>Crédito disponible</dt><dd className={creditError ? 'om-warn' : undefined}>{formatMoney(Math.max(creditAvailable, 0))}</dd></div>}
              </dl>

              <dl className="purchase-modal__totals">
                <div><dt>Subtotal</dt><dd className="mono">{formatMoney(subtotal)}</dd></div>
                <div><dt>IGV {Math.round(rate * 100)}%</dt><dd className="mono">{formatMoney(total - subtotal)}</dd></div>
                <div className="is-total"><dt>Total</dt><dd className="mono">{formatMoney(total)}</dd></div>
              </dl>

              <div className="om-summary__cta">
                <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving || !!missing} aria-describedby="om-missing">
                  {saving ? 'Guardando…' : submit}
                </button>
                <p id="om-missing" className="purchase-modal__hint om-missing" aria-live="polite">
                  {missing || (sale ? 'Queda por confirmar: ahí se reserva el stock.' : 'Queda lista para recibirse en Kardex; el egreso se registra al aprobar la recepción.')}
                </p>
              </div>
            </aside>
          </div>
        )}

        <div className="purchase-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}