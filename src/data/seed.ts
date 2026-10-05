import type { RecordsConfig } from '../features/records/types';
import { addDays, isoDate, parseDate } from '../lib/dates';
import { ajustes } from '../pages/configs/ajustes';
import { almacenes } from '../pages/configs/almacenes';
import { bancos } from '../pages/configs/bancos';
import { caja } from '../pages/configs/caja';
import { categorias } from '../pages/configs/categorias';
import { clientes } from '../pages/configs/clientes';
import { comprobantes } from '../pages/configs/comprobantes';
import { cotizaciones } from '../pages/configs/cotizaciones';
import { cuentasPorCobrar } from '../pages/configs/cuentasPorCobrar';
import { cuentasPorPagar } from '../pages/configs/cuentasPorPagar';
import { kardex } from '../pages/configs/kardex';
import { productos } from '../pages/configs/productos';
import { proveedores } from '../pages/configs/proveedores';
import { roles } from '../pages/configs/roles';
import { solicitudes } from '../pages/configs/solicitudes';
import { stock } from '../pages/configs/stock';
import { transferencias } from '../pages/configs/transferencias';
import { usuarios } from '../pages/configs/usuarios';
import { AUDIT_EVENTS, AUDIT_USERS, CLIENTS, DOCS, MOCK_TODAY, ORDERS, PREV, ROTATION, SALES, SUPPLIERS } from './mock';
import { defaultPermissions } from './permissions';
import { DEFAULT_SETTINGS } from './settings';
import type { DB, Order, OrderLine, OrderParty, RecordCollection, Row } from './types';

/** Collections seeded from each generic screen's sample rows. */
const RECORD_SOURCES: Record<RecordCollection, Pick<RecordsConfig, 'keys' | 'rows'>> = {
  clientes, proveedores, productos, categorias, almacenes, usuarios, roles, stock, kardex, transferencias, ajustes, caja, bancos, comprobantes,
  cxc: cuentasPorCobrar, cxp: cuentasPorPagar,
};

const toRows = (src: Pick<RecordsConfig, 'keys' | 'rows'>): Row[] =>
  (src.rows ?? []).map((r, i) => ({ _id: i + 1, ...Object.fromEntries(src.keys.map((k, j) => [k, r[j]])) }) as Row);

export function buildEmptyDB(keep?: Partial<Pick<DB, 'settings' | 'permisos'>> & { roles?: Row[] }): DB {
  const records = Object.fromEntries(Object.keys(RECORD_SOURCES).map(k => [k, []])) as unknown as DB['records'];
  records.roles = keep?.roles ?? toRows(roles);
  return {
    version: 1,
    mode: 'local',
    records,
    cotizaciones: [],
    solicitudes: [],
    orders: [],
    documentos: [],
    audit: [],
    permisos: keep?.permisos ?? defaultPermissions(),
    settings: keep?.settings ?? { ...DEFAULT_SETTINGS, cuentas: '' },
    history: { salesByMonth: {}, salesByClient: {}, purchasesBySupplier: {}, unitsSold90: {} },
    alertsRead: [],
    bankOpening: {},
    counters: {},
    reportSchedules: [],
  };
}

// ------------------------------------------------------------------ sample orders

const at = (d: Date, h = 10) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0).toISOString();

function clientParty(db: DB, name: string, ruc: string): OrderParty {
  const c = db.records.clientes.find(x => x.razon === name);
  if (!c) return { name, ruc, contact: '', terms: 'Crédito 30 días', address: '' };
  return { code: String(c.cod), name, ruc: String(c.ndoc), contact: `${c.contacto} · ${c.tel}`, terms: String(c.cond), address: String(c.dir), email: String(c.correo) };
}

function supplierParty(db: DB, name: string): OrderParty {
  const p = db.records.proveedores.find(x => x.razon === name)!;
  return { code: String(p.cod), name, ruc: String(p.ruc), contact: `${p.contacto} · ${p.tel}`, terms: String(p.cond), address: String(p.dir), email: String(p.correo) };
}

function line(db: DB, name: string, qty: number, price: number): OrderLine {
  const p = db.records.productos.find(x => x.nombre === name);
  // Keep sub-cent precision so sample totals match the design exactly (prices display rounded).
  return { sku: String(p?.sku ?? name), name, unit: String(p?.unidad ?? 'Unidad').toLowerCase(), qty, price: Math.round(price * 1e6) / 1e6 };
}

/** The 24 sales orders of the Órdenes de venta prototype, plus OV-2026-1283 in full detail. */
function sampleSales(db: DB): Order[] {
  const C = [['Distribuidora Andina S.A.C.', '20512345671'], ['Constructora Pacífico E.I.R.L.', '20601122334'], ['Minera Los Andes S.A.', '20100987652'], ['Farmacias Salud Total S.A.C.', '20488776651'], ['Textil Arequipa S.R.L.', '20455667788'], ['Comercial Norte Trujillo S.A.', '20399887766'], ['Agroexportadora Ica S.A.C.', '20577889900'], ['Ferretería El Constructor E.I.R.L.', '20611223344'], ['Clínica San Gabriel S.A.', '20144556677'], ['Inversiones Cusco Plaza S.A.C.', '20522334455']];
  const P = ['Cemento Portland Tipo I 42.5 kg', 'Tubo PVC 4" x 3 m clase 10', 'Guantes de nitrilo talla M x100', 'Fierro corrugado 1/2" x 9 m', 'Pintura látex blanco 4 L', 'Cable THW 12 AWG x 100 m', 'Casco de seguridad ANSI', 'Ladrillo King Kong 18 huecos'];
  const S = ['Pagado', 'Pendiente', 'Pagado', 'Vencido', 'Pagado', 'Pendiente', 'Pagado', 'Pagado', 'Vencido', 'Pendiente'];
  const T = [12480, 8920.5, 21300, 3145.9, 6760, 7820, 15240, 2390.4, 9875, 4410, 18600, 1290.8, 5530, 11200, 3980, 26750, 7340.6, 2215, 9460, 6100, 13890, 4725.3, 8040, 3360];
  const invoiceByOrder = new Map(db.records.comprobantes.map(c => [String(c.orden), String(c.num)]));
  let guia = 850, fac = 120, cobro = 500;

  const out = Array.from({ length: 24 }, (_, i): Order => {
    const day = addDays(MOCK_TODAY, -Math.floor(i * 1.6));
    const [name, ruc] = C[(i * 7) % 10];
    const status = S[(i * 3) % 10];
    const qty = 10 + ((i * 13) % 90);
    const code = 'OV-2026-' + (1284 - i);
    const done = status === 'Pagado' ? 5 : status === 'Vencido' ? 4 : 2 + (i % 3);
    const party = clientParty(db, name, ruc);
    const due = status === 'Vencido' ? addDays(day, -5) : addDays(day, 30);
    const o: Order = {
      kind: 'venta', code, createdAt: at(day), party, lines: [line(db, P[(i * 5) % 8], qty, T[i] / 1.18 / qty)],
      warehouse: i % 2 ? 'Almacén Callao' : 'Almacén Lima', done, forms: {}, docs: { 0: 'Venta directa', 1: code }, log: {},
      seller: i % 3 ? 'Luis Paredes' : 'María Rojas', igvRate: 0.18,
    };
    for (let s = 0; s < done; s++) o.log[s] = { who: o.seller, at: at(day, 10 + s) };
    if (done >= 3) o.docs[2] = `Guía T001-${String(guia++).padStart(5, '0')}`;
    if (done >= 4) {
      o.docs[3] = 'Factura ' + (invoiceByOrder.get(code) ?? `F001-${String(fac++).padStart(5, '0')}`);
      o.forms[3] = { tipo: 'Factura electrónica', fe: isoDate(day), fv: isoDate(due), fp: party.terms };
    }
    if (done >= 5) {
      o.docs[4] = `Cobro CB-2026-${String(cobro++).padStart(4, '0')}`;
      o.forms[4] = { med: 'Transferencia', cta: 'BCP · 191-2345678' };
    }
    return o;
  });

  // OV-2026-1283 as designed in "Orden de venta": confirmed, waiting for dispatch.
  const detailed: Order = {
    kind: 'venta', code: 'OV-2026-1283', createdAt: at(MOCK_TODAY, 9), origin: 'COT-2026-0318', seller: 'Luis Paredes', igvRate: 0.18,
    party: clientParty(db, 'Constructora Pacífico E.I.R.L.', '20601122334'),
    lines: [line(db, 'Cemento Portland Tipo I 42.5 kg', 170, 28.5), line(db, 'Fierro corrugado 1/2" x 9 m', 60, 41.2), line(db, 'Clavos para madera 3"', 25, 9.71)],
    warehouse: 'Almacén Callao', done: 2,
    forms: { 1: { ent: '2026-10-05', alm: 'Almacén Callao', cond: 'Crédito 30 días', dir: 'Av. Los Constructores 1450, Chorrillos, Lima' } },
    docs: { 0: 'COT-2026-0318', 1: 'OV-2026-1283' },
    log: { 0: { who: 'Luis Paredes', at: '2026-09-28T15:00:00.000Z' }, 1: { who: 'Luis Paredes', at: at(MOCK_TODAY, 9) } },
  };
  return out.map(o => (o.code === detailed.code ? detailed : o));
}

/** The purchase orders of the Órdenes de compra prototype; OC-2026-0412 in full detail. */
function samplePurchases(db: DB): Order[] {
  const base = (code: string, date: string, prov: string, done: number, origin: string, lines: OrderLine[], wh: string): Order => {
    const day = parseDate(date)!;
    const o: Order = { kind: 'compra', code, createdAt: at(day), party: supplierParty(db, prov), lines, warehouse: wh, done, forms: {}, docs: { 0: origin, 1: code }, log: {}, origin, seller: 'Ana Torres', igvRate: 0.18 };
    for (let s = 0; s < done; s++) o.log[s] = { who: s === 1 ? 'María Rojas' : 'Ana Torres', at: at(day, 10 + s) };
    if (done >= 2) o.forms[1] = { prv: prov, ent: isoDate(addDays(day, 4)), alm: wh, cond: o.party.terms };
    return o;
  };
  const received = (o: Order, ni: string, date: string, who: string, est = 'Conforme') => {
    o.docs[2] = 'Ingreso ' + ni;
    o.forms[2] = { fr: isoDate(parseDate(date)!), gr: '—', rec: who, alm: o.warehouse, est, obs: est === 'Conforme' ? '' : 'Se recibieron 4 cascos con fallas. El proveedor repondrá en su próxima entrega.' };
    return o;
  };
  const invoiced = (o: Order, num: string) => {
    o.docs[3] = 'Factura ' + num;
    o.forms[3] = { num, mon: String(Math.round(o.lines.reduce((a, l) => a + l.qty * l.price, 0) * 1.18 * 100) / 100) };
    return o;
  };
  const paid = (o: Order, pg: string) => {
    o.docs[4] = 'Pago ' + pg;
    o.forms[4] = { med: 'Transferencia', cta: 'Interbank · 200-3011' };
    return o;
  };
  return [
    base('OC-2026-0413', '01 oct 2026', 'Cementos Pacasmayo Dist. S.A.', 1, 'SOL-2026-0089', [line(db, 'Cemento Portland Tipo I 42.5 kg', 500, 22.1)], 'Almacén Lima'),
    { ...base('OC-2026-0412', '30 sep 2026', 'Aceros del Sur S.A.C.', 2, 'SOL-2026-0087', [line(db, 'Fierro corrugado 1/2" x 9 m', 300, 34.8), line(db, 'Alambre negro recocido N.º 16', 150, 5.4), line(db, 'Clavos para madera 3"', 120, 7.9)], 'Almacén Lima'), forms: { 1: { prv: 'Aceros del Sur S.A.C.', ent: '2026-10-03', alm: 'Almacén Lima', cond: 'Crédito 45 días' } } },
    received(base('OC-2026-0409', '24 sep 2026', 'Plásticos Lima S.R.L.', 3, 'SOL-2026-0084', [line(db, 'Tubo PVC 4" x 3 m clase 10', 120, 27.5)], 'Almacén Callao'), 'NI-2026-0608', '29 sep 2026', 'Jorge Quispe'),
    invoiced(received(base('OC-2026-0405', '18 sep 2026', 'EPP Seguridad Total S.A.C.', 4, 'SOL-2026-0079', [line(db, 'Guantes de nitrilo talla M x100', 60, 17.2), line(db, 'Casco de seguridad ANSI', 40, 19.55)], 'Almacén Callao'), 'NI-2026-0603', '22 sep 2026', 'Carlos Huamán', 'Con observaciones'), 'E001-00918'),
    paid(invoiced(received(base('OC-2026-0401', '10 sep 2026', 'Pinturas Andinas S.A.', 5, 'SOL-2026-0074', [line(db, 'Pintura látex blanco 4 L', 120, 44.63)], 'Almacén Lima'), 'NI-2026-0597', '15 sep 2026', 'Jorge Quispe'), 'F001-04410'), 'PG-2026-0214'),
    paid(invoiced(received(base('OC-2026-0398', '05 sep 2026', 'Cables y Conductores Perú S.A.', 5, 'SOL-2026-0071', [line(db, 'Cable THW 12 AWG x 100 m', 30, 137.85)], 'Almacén Lima'), 'NI-2026-0590', '09 sep 2026', 'Carlos Huamán'), 'F001-03392'), 'PG-2026-0210'),
  ];
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const orderTotal = (o: Order) => o.lines.reduce((a, l) => a + l.qty * l.price, 0) * (1 + o.igvRate);

export function buildDemoDB(): DB {
  const db = buildEmptyDB({ settings: { ...DEFAULT_SETTINGS } });
  db.mode = 'demo';
  for (const k of Object.keys(RECORD_SOURCES) as RecordCollection[]) db.records[k] = toRows(RECORD_SOURCES[k]);

  db.cotizaciones = structuredClone(cotizaciones.rows);
  db.solicitudes = structuredClone(solicitudes.rows);
  db.orders = [...sampleSales(db), ...samplePurchases(db)];

  // Link receivables/payables to their order when that order already reached invoicing.
  for (const c of db.records.cxc) {
    const comp = db.records.comprobantes.find(x => x.num === c.doc);
    const o = comp && db.orders.find(x => x.code === comp.orden);
    c.orden = o && o.done >= 4 ? o.code : '';
  }
  for (const p of db.records.cxp) {
    const o = db.orders.find(x => x.kind === 'compra' && x.docs[3] === 'Factura ' + p.doc);
    p.orden = o ? o.code : '';
  }

  db.documentos = DOCS.map(([name, cat, ref, entity, size, date, by], i) => ({ id: i + 1, name, cat, ref, entity, size, date: parseDate(date)!.toISOString(), by, version: i % 3 === 0 ? 'v2 · actual' : 'v1 · actual' }));

  db.audit = AUDIT_EVENTS.map(([mins, u, action, module, ref, desc, result, extra], i) => {
    const t = new Date(MOCK_TODAY.getTime() - mins * 60000 - i * 17000);
    const system = u === 'SY';
    return {
      id: 'AUD-' + (884120 - i), at: t.toISOString(), user: AUDIT_USERS[u][0], role: AUDIT_USERS[u][1],
      action: action as DB['audit'][number]['action'], module, ref, desc, result,
      changes: Array.isArray(extra) ? extra : [], note: Array.isArray(extra) ? '' : extra,
      ip: system && action === 'Ingreso' ? '181.65.203.17' : system ? 'interno' : `10.0.${12 + (i % 4)}.${20 + ((i * 7) % 200)}`,
      device: system ? (action === 'Ingreso' ? 'Desconocido · Linux' : 'Servicio backend') : ['Chrome · Windows', 'Edge · Windows', 'Safari · macOS', 'Chrome · Android'][i % 4],
    };
  });

  // Report history = design figures minus what the sample orders already contribute.
  const sales = db.orders.filter(o => o.kind === 'venta');
  const live = (key: string) => sales.filter(o => monthKey(new Date(o.createdAt)) === key);
  for (let i = 0; i < 12; i++) {
    const cur = monthKey(new Date(2025, 9 + i, 1));
    const prev = monthKey(new Date(2024, 9 + i, 1));
    const l = live(cur);
    db.history.salesByMonth[cur] = { total: Math.max(0, SALES[i] - l.reduce((a, o) => a + orderTotal(o), 0)), orders: Math.max(0, ORDERS[i] - l.length) };
    db.history.salesByMonth[prev] = { total: PREV[i], orders: Math.round(PREV[i] / 545) };
  }
  for (const [name, v] of CLIENTS) db.history.salesByClient[name] = Math.max(0, v - sales.filter(o => o.party.name === name).reduce((a, o) => a + orderTotal(o), 0));
  for (const [name, v] of SUPPLIERS) db.history.purchasesBySupplier[name] = Math.max(0, v - db.orders.filter(o => o.kind === 'compra' && o.party.name === name).reduce((a, o) => a + orderTotal(o), 0));

  for (const [sku, , , , sold] of ROTATION) db.history.unitsSold90[sku] = sold;

  // Opening balances so the bank cards show the designed balances.
  const designed: Record<string, number> = { 'BCP · 191-2345678': 148320.4, 'Interbank · 200-3011': 62115, 'BBVA · 0011-0245': 39870.25 };
  for (const [acc, bal] of Object.entries(designed)) db.bankOpening[acc] = bal - db.records.bancos.filter(b => b.cuenta === acc).reduce((a, b) => a + Number(b.monto), 0);

  return db;
}

