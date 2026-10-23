import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinesEditor } from '@/shared/components/LinesEditor';
import { PartyPicker, type PartyOption } from '@/shared/components/PartyPicker';
import { SearchSelect } from '@/shared/components/SearchSelect';
import { TransportPicker } from '@/shared/components/TransportPicker';
import './OrderCreateModal.css';
import { OWN_FLEET } from '@/data/domain/carriers';
import { supplierCost } from '@/data/domain/masters';
import { igvRate, orderSubtotal, orderTotal, partyFromClient, partyFromSupplier, payTermOptions, warehouses } from '@/data/domain/orders';
import { createPurchaseOrderRemote } from '@/data/domain/purchaseOrders';
import { createSaleOrderRemote } from '@/data/domain/salesOrders';
import { currentUser, useDB } from '@/data/store';
import type { Order, OrderLine, Row } from '@/data/types';
import { addDays, isoDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { discountAmount, distributeDiscount } from '@/shared/lib/discount';
import { linesError } from '@/shared/lib/lines';

/** Tipos de comprobante que puede emitir una orden de venta. */
/** Factura exige RUC (11 dígitos); con DNI u otro documento solo se emite boleta. La nota de crédito se emite después, al anular un comprobante. */
const DOC_TYPES = ['Factura', 'Boleta'] as const;

interface Props {
  kind: Order['kind'];
  onClose: () => void;
  /** Se llama con la orden ya guardada en el servidor; el modal no navega a ninguna otra pantalla. */
  onCreated: (order: Order) => void;
}

/**
 * Ventana ancha para crear una orden de compra o de venta sin salir de la lista: formulario a la izquierda y resumen a la derecha.
 * Compras: proveedor + almacén destino + productos. Ventas: cliente, entrega y condiciones + productos.
 * La orden de compra no pide aprobación al crearse: queda lista para recepción en Kardex.
 */
export function OrderCreateModal({ kind, onClose, onCreated }: Props) {
  const d = useDB();
  const sale = kind === 'venta';
  const parties = (sale ? d.records.clientes : d.records.proveedores).filter(p => p.estado !== 'Inactivo');
  const whs = warehouses(d);
  const rate = igvRate(d);

  // Lo elegido por el usuario; si aún no eligió (o los datos llegaron después del primer render) se usa la primera opción real.
  const [pickedParty, setPickedParty] = useState<number | ''>('');
  const [pickedWarehouse, setPickedWarehouse] = useState('');
  // Transporte: «Nuestras movilidades» (flota de la empresa, con conductor y vehículo) o «Movilidad propia» (la lleva el cliente).
  const [transport, setTransport] = useState<'' | 'fleet' | 'client'>('');
  const [pickedDriver, setPickedDriver] = useState('');
  const [pickedPlate, setPickedPlate] = useState('');
  const [pickedTerms, setPickedTerms] = useState('');
  const [pickedDocType, setPickedDocType] = useState<'' | 'Factura' | 'Boleta'>('');
  const [deliveryDate, setDeliveryDate] = useState(() => isoDate(addDays(new Date(), 3)));
  // Al contado: fecha límite de pago; si no se aprueba y paga hasta ese día, la orden se anula sola.
  const [payDeadline, setPayDeadline] = useState(() => isoDate(addDays(new Date(), 1)));
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [discountMode, setDiscountMode] = useState<'amount' | 'pct'>('pct');
  const [discountInput, setDiscountInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Sin cliente/proveedor preseleccionado: el usuario debe elegirlo.
  const partyId = parties.some(p => p._id === pickedParty) ? pickedParty : '';
  const party = parties.find(p => p._id === partyId);
  const partyName = String(party?.razon ?? '');
  const defaultWarehouse = d.settings.almdef && whs.includes(String(d.settings.almdef)) ? String(d.settings.almdef) : whs[0];
  // Venta: almacén por defecto. Compra: sin preselección, el usuario elige a qué almacén ingresa.
  const warehouse = whs.includes(pickedWarehouse) ? pickedWarehouse : sale ? defaultWarehouse : '';
  // Flota propia: conductores y vehículos activos de la empresa. Elegir uno trae al otro (el vehículo guarda su conductor habitual).
  const fleetDrivers = d.records.conductores.filter(c => c.estado === 'Activo' && c.empresa === OWN_FLEET);
  const fleetVehicles = d.records.vehiculos.filter(v => v.estado === 'Activo' && v.empresa === OWN_FLEET);
  const driverOf = (v: Row | undefined) => String(v?.conductor ?? '').split(' · ')[0];
  const driver = pickedDriver && fleetDrivers.some(c => c.nombre === pickedDriver) ? pickedDriver : '';
  const plate = pickedPlate && fleetVehicles.some(v => v.placa === pickedPlate) ? pickedPlate : '';
  // Elegir un vehículo trae a su conductor habitual; el conductor se puede cambiar aparte.
  const pickPlate = (p: string) => {
    setTransport('fleet');
    setPickedPlate(p);
    const name = driverOf(fleetVehicles.find(x => x.placa === p));
    setPickedDriver(name && fleetDrivers.some(c => c.nombre === name) ? name : '');
  };
  const needsFleet = transport === 'fleet' && fleetDrivers.length > 0 && fleetVehicles.length > 0;
  const carrier = transport === 'fleet' ? OWN_FLEET : 'Retira el cliente';
  const seller = currentUser(d).name;
  const terms = pickedTerms || String(party?.cond || 'Contado');
  const creditDays = Number(/(\d+)/.exec(terms)?.[1] ?? 0);
  const cash = creditDays === 0;
  // Comprobante: si no lo eligió, Factura para RUC (11 dígitos) y Boleta para el resto.
  const partyDoc = String(party?.ndoc ?? party?.ruc ?? '').replace(/\D/g, '');
  const hasRuc = partyDoc.length === 11;
  const docType: 'Factura' | 'Boleta' = party && !hasRuc ? 'Boleta' : pickedDocType || (party ? 'Factura' : 'Boleta');
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

  // Descuento global: se escribe en S/ o en %, y se reparte entre las líneas en proporción a su subtotal.
  const gross = orderSubtotal({ lines });
  const maxDiscountPct = parseFloat(String(d.settings.desc ?? '')) || 0;
  const discount = sale ? discountAmount(gross, discountMode, Number(discountInput.replace(',', '.'))) : 0;
  const discountPct = gross > 0 ? (discount / gross) * 100 : 0;
  const discountError = !discount ? ''
    : discount >= gross ? 'El descuento no puede ser igual o mayor que el subtotal'
      : discountPct > maxDiscountPct + 0.01 ? `Máximo ${maxDiscountPct}% (Configuración)` : '';
  const netLines = discount && !discountError ? distributeDiscount(lines, discount) : lines;
  const lineDiscounts = netLines === lines ? undefined : lines.map((l, i) => Math.round((l.qty * l.price - netLines[i].qty * netLines[i].price) * 100) / 100);
  const subtotal = orderSubtotal({ lines: netLines });
  const total = orderTotal({ lines: netLines, igvRate: rate });
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
  const missing = !party ? 'Elige un ' + (sale ? 'cliente' : 'proveedor') : sale && !transport ? 'Elige la movilidad' : !sale && !warehouse ? 'Elige el almacén destino' : !lines.length ? 'Agrega al menos un producto' : discountError ? `Descuento: ${discountError}` : creditError ? creditError : sale && needsFleet && (!driver || !plate) ? 'Elige conductor y vehículo' : '';

  // Esc cierra el modal, salvo mientras se guarda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const pickParty = (id: number) => {
    setPickedParty(id);
    setPickedTerms('');
    setPickedDocType('');
    if (sale) return;
    // Compras: al cambiar de proveedor las líneas toman el costo pactado con ese proveedor (si lo tiene registrado).
    const name = String(parties.find(p => p._id === id)?.razon ?? '');
    setLines(ls => ls.map(l => ({ ...l, price: supplierCost(name, l.sku) ?? l.price })));
  };

  const save = async () => {
    if (!party) return setError(sale ? 'Elige un cliente.' : 'Elige un proveedor.');
    if (!warehouse) return setError('Elige el almacén destino.');
    if (creditError) return setError(creditError + '.');
    if (sale && !deliveryDate) return setError('Indica la fecha de entrega.');
    if (sale && cash && !payDeadline) return setError('Indica la fecha límite de pago.');
    if (sale && cash && payDeadline < isoDate(new Date())) return setError('La fecha límite de pago no puede ser anterior a hoy.');
    const le = linesError(lines);
    if (le) return setError(le);
    setSaving(true);
    setError('');
    try {
      const res = sale
        ? await createSaleOrderRemote({
          party: { ...partyFromClient(party), terms },
          lines: netLines,
          discountAmount: discount && !discountError ? discount : 0,
          warehouse,
          seller,
          customerLocalId: Number(party._id),
          carrier,
          driver: transport === 'fleet' ? driver : undefined,
          vehiclePlate: transport === 'fleet' ? plate : undefined,
          deliveryDate,
          deliveryAddress: address,
          payDeadline: cash ? payDeadline : undefined,
          documentType: docType,
        })
        : await createPurchaseOrderRemote({
          party: partyFromSupplier(party),
          lines,
          warehouse,
          seller,
          supplierLocalId: Number(party._id),
        });
      if (!res.ok) return setError(res.error);
      onCreated(res.order);
    } finally {
      setSaving(false);
    }
  };

  const title = sale ? 'Nueva orden de venta' : 'Nueva orden de compra';
  const submit = sale ? 'Crear orden de venta' : 'Crear orden de compra';
  const emptyNote = sale ? (
    <>Primero registra un cliente en <Link to="/mantenimiento/clientes">Mantenimiento</Link>.</>
  ) : (
    <>Primero registra un proveedor en <Link to="/mantenimiento/proveedores">Mantenimiento</Link>.</>
  );

  return (
    <div className="purchase-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className={'purchase-modal purchase-modal--fixed om--sale' + (sale ? '' : ' om--purchase')} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
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
              {sale && (
                <section className="om-section">
                  <h3 className="om-section__title">Pago y entrega</h3>
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
                          <label className="field">
                            <span className="field__label">Fecha de pago ({creditDays} días)</span>
                            <input className="field__control" type="date" value={isoDate(addDays(new Date(), creditDays))} readOnly disabled title="Se calcula sola según la condición de pago" />
                          </label>
                        )}
                        <label className="field">
                          <span className="field__label">Tipo de comprobante</span>
                          <select className="field__control" value={docType} onChange={e => setPickedDocType(e.target.value as 'Factura' | 'Boleta')}>
                            {DOC_TYPES.map(t => <option key={t} disabled={t === 'Factura' && !!party && !hasRuc}>{t}{t === 'Factura' && party && !hasRuc ? ' (requiere RUC)' : ''}</option>)}
                          </select>
                        </label>
                        <div className="field">
                          <span className="field__label">Almacén de despacho</span>
                          <SearchSelect
                            ariaLabel="Almacén de despacho"
                            value={warehouse}
                            options={whs.map(w => ({ value: w, label: w }))}
                            onChange={setPickedWarehouse}
                            placeholder="Busca un almacén…"
                          />
                        </div>
                        <label className="field">
                          <span className="field__label">Fecha de entrega *</span>
                          <input className="field__control" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                        </label>
                      </>
                    ) : null}
                  </div>
                </section>
              )}

              <section className="om-section om-section--lines">
                <h3 className="om-section__title">
                  Productos
                  {lines.length > 0 && <span className="om-count">{lines.length}</span>}
                </h3>
                <LinesEditor
                  lineDiscounts={sale ? lineDiscounts : undefined}
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

              {!sale && (
                <section className="om-transport" aria-label="Almacén destino">
                  <h3 className="purchase-modal__label">Almacén destino</h3>
                  <SearchSelect
                    ariaLabel="Almacén destino"
                    value={warehouse}
                    options={whs.map(w => ({ value: w, label: w }))}
                    onChange={setPickedWarehouse}
                    placeholder="Elige un almacén…"
                  />
                </section>
              )}

              {sale && (
                <section className="om-transport" aria-label="Transporte">
                  <h3 className="purchase-modal__label">Transporte</h3>
                  <TransportPicker
                    mode={transport}
                    plate={plate}
                    driver={driver}
                    vehicles={fleetVehicles.map(v => ({
                      plate: String(v.placa),
                      type: String(v.tipo ?? ''),
                      brand: [v.marca, v.modelo].filter(Boolean).join(' '),
                      capacity: String(v.capacidad ?? ''),
                      driver: driverOf(v),
                    }))}
                    drivers={fleetDrivers.map(c => ({ name: String(c.nombre), dni: String(c.dni ?? ''), license: String(c.licencia ?? ''), phone: String(c.tel ?? '') }))}
                    onPickVehicle={pickPlate}
                    onPickClient={() => { setTransport('client'); setPickedPlate(''); setPickedDriver(''); }}
                    onPickDriver={setPickedDriver}
                  />
                </section>
              )}

              <div className="purchase-modal__label">Resumen</div>
              <dl className="om-facts">
                <div><dt>Productos</dt><dd>{lines.length ? `${lines.length} · ${units.toLocaleString('en-US')} und.` : '—'}</dd></div>
                {sale && !cash && <div><dt>Crédito disponible</dt><dd className={creditError ? 'om-warn' : undefined}>{formatMoney(Math.max(creditAvailable, 0))}</dd></div>}
              </dl>

              <dl className="purchase-modal__totals">
                <div><dt>Subtotal</dt><dd className="mono">{formatMoney(gross)}</dd></div>
                {sale && (
                  <div className="om-discount">
                    <dt>
                      Descuento
                      <span className="om-discount__ctl">
                        <span className="om-discount__seg" role="radiogroup" aria-label="Tipo de descuento">
                          <button type="button" role="radio" aria-checked={discountMode === 'amount'} className={discountMode === 'amount' ? 'is-on' : undefined} onClick={() => setDiscountMode('amount')}>S/</button>
                          <button type="button" role="radio" aria-checked={discountMode === 'pct'} className={discountMode === 'pct' ? 'is-on' : undefined} onClick={() => setDiscountMode('pct')}>%</button>
                        </span>
                        <input
                          className={'om-discount__input mono' + (discountError ? ' is-invalid' : '')}
                          inputMode="decimal"
                          placeholder="0"
                          value={discountInput}
                          disabled={!lines.length}
                          onChange={e => setDiscountInput(e.target.value.replace(/[^\d.,]/g, ''))}
                          aria-label={discountMode === 'pct' ? 'Descuento en porcentaje' : 'Descuento en soles'}
                          title={`Máximo ${maxDiscountPct}% según Configuración`}
                        />
                      </span>
                    </dt>
                    <dd className={'mono' + (discount && !discountError ? ' om-discount__amt' : '')}>{discount && !discountError ? `−${formatMoney(discount)}` : '—'}</dd>
                    {discountError && <p className="om-discount__err">{discountError}</p>}
                  </div>
                )}
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