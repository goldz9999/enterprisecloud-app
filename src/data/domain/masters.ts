import { api, ApiError } from '@/shared/lib/api';
import { update } from '../store';
import type { DB, Row, Value } from '../types';

/**
 * Maestros de Mantenimiento (clientes, proveedores, productos, categorías, almacenes, conductores y vehículos).
 * La fuente de verdad es el backend (Supabase). El store local (`d.records.*`) es solo un espejo para que el resto
 * de la app (órdenes, flujos, reportes…) siga leyendo `d.records.clientes`, etc. sin cambios.
 */

export const MASTER_COLLECTIONS = ['clientes', 'proveedores', 'productos', 'categorias', 'almacenes', 'conductores', 'vehiculos', 'preciosProv'] as const;
export type MasterCollection = (typeof MASTER_COLLECTIONS)[number];

export function isMaster(c: string | undefined): c is MasterCollection {
    return !!c && (MASTER_COLLECTIONS as readonly string[]).includes(c);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
type Vals = Record<string, Value>;

const NONE = '—';
const OWN = 'Movilidad propia';

class Invalid extends Error { }
function bad(message: string): never {
    throw new Invalid(message);
}

// ---------- helpers ----------

const text = (v: Value | undefined) => String(v ?? '').trim();
const opt = (v: Value | undefined) => text(v) || null;
const num = (v: unknown) => Number(v) || 0;
const stateOf = (s: unknown) => (s === 'INACTIVE' ? 'Inactivo' : 'Activo');
const statusOf = (v: Value | undefined) => (text(v) === 'Inactivo' ? 'INACTIVE' : 'ACTIVE');
const termsOf = (days: unknown) => (num(days) > 0 ? `Crédito ${num(days)} días` : 'Contado');
const daysOf = (v: Value | undefined) => Number(/(\d+)/.exec(text(v))?.[1] ?? 0);

const WAREHOUSE_TYPES: Record<string, string> = { MAIN: 'Principal', SECONDARY: 'Secundario', TRANSIT: 'Tránsito' };
const warehouseTypeOf = (label: string) => Object.entries(WAREHOUSE_TYPES).find(([, v]) => v === label)?.[0] ?? 'MAIN';

// ---------- cache de datos del backend ----------

const raw: Record<MasterCollection, Raw[]> = { clientes: [], proveedores: [], productos: [], categorias: [], almacenes: [], conductores: [], vehiculos: [], preciosProv: [] };
const loaded = new Set<MasterCollection>();
let users: { id: string; name: string; active: boolean }[] = [];

/** Ids locales (numéricos) estables para cada uuid del backend. */
const ids = new Map<string, number>();
const uuids = new Map<number, string>();
let seq = 0;
function localId(uuid: string): number {
    let n = ids.get(uuid);
    if (!n) {
        n = ++seq;
        ids.set(uuid, n);
        uuids.set(n, uuid);
    }
    return n;
}

const byId = (c: MasterCollection, id: unknown) => (id ? raw[c].find(r => r.id === id) : undefined);
const idByName = (c: MasterCollection, field: string, name: Value | undefined): string | null => {
    const n = text(name);
    return n && n !== NONE ? (raw[c].find(r => r[field] === n)?.id ?? null) : null;
};
const userName = (id: unknown) => users.find(u => u.id === id)?.name ?? NONE;
const userId = (name: Value | undefined): string | null => {
    const n = text(name);
    return n && n !== NONE ? (users.find(u => u.name === n)?.id ?? null) : null;
};

/** Clientes y proveedores del backend para vincular un documento: `value` es `c:<id>` o `s:<id>`. */
export function relationOptions(): { customers: { value: string; label: string }[]; suppliers: { value: string; label: string }[] } {
    return {
        customers: raw.clientes.map(r => ({ value: `c:${r.id}`, label: `${r.code} · ${r.legal_name}` })),
        suppliers: raw.proveedores.map(r => ({ value: `s:${r.id}`, label: `${r.code} · ${r.legal_name}` })),
    };
}

/** Resuelve un código (CLI-00001 / PRV-00001) a su valor de relación, o '' si no corresponde a ningún maestro. */
export function relationByCode(code: string): string {
    const c = raw.clientes.find(r => r.code === code);
    if (c) return `c:${c.id}`;
    const s = raw.proveedores.find(r => r.code === code);
    return s ? `s:${s.id}` : '';
}

/** Almacenes del backend, para el almacén por defecto de Configuración. */
export const warehouseIdByName = (name: string): string | null => idByName('almacenes', 'name', name);
export const warehouseNameById = (id: unknown): string => String(byId('almacenes', id)?.name ?? '');

/** Nombres de usuarios del backend (para vendedor / responsable). */
export const masterUserNames = (): string[] => [NONE, ...users.filter(u => u.active).map(u => u.name)];

/** UUID del maestro a partir del _id local del store. */
export function masterUuid(_c: MasterCollection, localRowId: number): string | null {
    return uuids.get(localRowId) ?? null;
}

/** UUID de producto por SKU. */
export function productUuidBySku(sku: string): string | null {
    return raw.productos.find(r => r.sku === sku)?.id ?? null;
}

export function productUuidByName(name: string): string | null {
    return raw.productos.find(r => r.name === name)?.id ?? null;
}

export function productByNameRaw(name: string): { id: string; sku: string; name: string; unit: string } | null {
    const r = raw.productos.find(x => x.name === name || x.sku === name);
    return r ? { id: r.id, sku: r.sku, name: r.name, unit: r.unit } : null;
}

/**
 * Precio de compra (sin IGV) de un producto en un proveedor, según la lista de Mantenimiento › Precios de proveedor.
 * null si ese proveedor no tiene precio registrado para el producto.
 */
export function supplierCost(supplierName: string, sku: string): number | null {
    const supplier = raw.proveedores.find(r => r.legal_name === supplierName);
    const product = raw.productos.find(r => r.sku === sku);
    if (!supplier || !product) return null;
    const hit = raw.preciosProv.find(r => r.supplier_id === supplier.id && r.product_id === product.id && r.status !== 'INACTIVE');
    return hit ? num(hit.unit_cost) : null;
}

/** UUID de usuario por nombre completo. */
export function userUuidByName(name: string): string | null {
    return userId(name);
}

/** UUID de cliente por razón social. */
export function customerUuidByName(name: string): string | null {
    return idByName('clientes', 'legal_name', name);
}

export function supplierUuidByName(name: string): string | null {
    return idByName('proveedores', 'legal_name', name);
}

function carrier(v: Value | undefined): { own: boolean; id: string | null } {
    const n = text(v);
    if (!n || n === OWN) return { own: true, id: null };
    const id = idByName('proveedores', 'legal_name', n);
    if (!id) bad('Selecciona un transportista registrado en Proveedores (con rubro "Transporte").');
    return { own: false, id };
}

const carrierLabel = (own: boolean, id: unknown) => (own ? OWN : (byId('proveedores', id)?.legal_name ?? OWN));

function margin(v: Value | undefined): number | null {
    const s = text(v).replace('%', '').replace(',', '.').trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 100) bad('El margen objetivo debe ser un número entre 0 y 100 (ej. 25%).');
    return n;
}

function capacity(v: Value | undefined): { capacity: number | null; capacityUnit: string | null } {
    const s = text(v);
    if (!s) return { capacity: null, capacityUnit: null };
    const m = /^([\d.,]+)\s*(.*)$/.exec(s);
    const n = m ? Number(m[1].replace(',', '.')) : NaN;
    if (!m || !Number.isFinite(n) || n < 0) bad('Capacidad: escribe un número y la unidad, por ejemplo 10 Tn.');
    return { capacity: n, capacityUnit: m[2].trim() || null };
}

const driverLabel = (d: Raw) => `${d.full_name} · ${d.national_id}`;

// ---------- mapeo frontend <-> backend ----------

interface Spec {
    path: string;
    /** Registro del backend → fila del frontend. */
    row: (r: Raw) => Vals;
    /** Valores del formulario → cuerpo de la petición (camelCase). */
    body: (v: Vals) => Record<string, unknown>;
}

const SPECS: Record<MasterCollection, Spec> = {
    clientes: {
        path: '/customers',
        row: r => ({
            cod: r.code, razon: r.legal_name, tdoc: r.document_type, ndoc: r.document_number, contacto: r.contact_name ?? '', tel: r.phone ?? '',
            correo: r.billing_email ?? '', dir: r.fiscal_address ?? '', cond: termsOf(r.payment_terms_days), linea: num(r.credit_limit),
            vend: userName(r.salesperson_user_id), estado: stateOf(r.status),
        }),
        body: v => {
            const type = text(v.tdoc) || 'RUC';
            const doc = text(v.ndoc);
            if (type === 'RUC' && !/^\d{11}$/.test(doc)) bad('El RUC debe tener 11 dígitos');
            if (type === 'DNI' && !/^\d{8}$/.test(doc)) bad('El DNI debe tener 8 dígitos');
            return {
                legalName: text(v.razon), documentType: type, documentNumber: doc, contactName: opt(v.contacto), phone: opt(v.tel), billingEmail: opt(v.correo),
                fiscalAddress: opt(v.dir), paymentTermsDays: daysOf(v.cond), creditLimit: num(v.linea), salespersonUserId: userId(v.vend), status: statusOf(v.estado),
            };
        },
    },
    proveedores: {
        path: '/suppliers',
        row: r => ({
            cod: r.code, razon: r.legal_name, ruc: r.tax_id, contacto: r.contact_name ?? '', tel: r.phone ?? '', correo: r.email ?? '', dir: r.address ?? '',
            rubro: r.business_category ?? '', cond: termsOf(r.payment_terms_days), cuenta: r.bank_details_label ?? '', estado: stateOf(r.status),
        }),
        body: v => ({
            legalName: text(v.razon), taxId: text(v.ruc), contactName: opt(v.contacto), phone: opt(v.tel), email: opt(v.correo), address: opt(v.dir),
            businessCategory: opt(v.rubro), paymentTermsDays: daysOf(v.cond), bankDetailsLabel: opt(v.cuenta), status: statusOf(v.estado),
        }),
    },
    categorias: {
        path: '/categories',
        row: r => ({
            cod: r.code, nombre: r.name, desc: r.description ?? '', padre: byId('categorias', r.parent_category_id)?.name ?? NONE, prods: 0,
            margen: r.target_margin_pct != null ? `${num(r.target_margin_pct)}%` : '', estado: stateOf(r.status),
        }),
        body: v => ({ name: text(v.nombre), description: opt(v.desc), parentCategoryId: idByName('categorias', 'name', v.padre), targetMarginPct: margin(v.margen), status: statusOf(v.estado) }),
    },
    productos: {
        path: '/products',
        row: r => ({
            sku: r.sku, nombre: r.name, cat: byId('categorias', r.category_id)?.name ?? '', unidad: r.unit, precio: num(r.sale_price), costo: num(r.average_cost),
            min: num(r.minimum_stock), prov: byId('proveedores', r.primary_supplier_id)?.legal_name ?? '', igv: r.taxable ? 'Sí' : 'No', estado: stateOf(r.status),
        }),
        // El costo promedio NO se envía: lo calcula el sistema con los movimientos de inventario.
        body: v => ({
            sku: text(v.sku), name: text(v.nombre), categoryId: idByName('categorias', 'name', v.cat), unit: text(v.unidad) || 'Unidad', salePrice: num(v.precio),
            minimumStock: num(v.min), primarySupplierId: idByName('proveedores', 'legal_name', v.prov), taxable: text(v.igv) !== 'No', status: statusOf(v.estado),
        }),
    },
    almacenes: {
        path: '/warehouses',
        row: r => ({
            cod: r.code, nombre: r.name, dir: r.address ?? '', distrito: r.district ?? '', resp: userName(r.manager_user_id), tipo: WAREHOUSE_TYPES[r.warehouse_type] ?? 'Principal',
            prods: 0, valor: 0, estado: stateOf(r.status),
        }),
        body: v => ({ name: text(v.nombre), warehouseType: warehouseTypeOf(text(v.tipo)), address: opt(v.dir), district: opt(v.distrito), managerUserId: userId(v.resp), status: statusOf(v.estado) }),
    },
    conductores: {
        path: '/drivers',
        row: r => ({
            cod: r.code, nombre: r.full_name, dni: r.national_id, tel: r.phone ?? '', licencia: r.license_number, categoria: r.license_category,
            empresa: carrierLabel(!!r.is_company_driver, r.carrier_supplier_id), estado: stateOf(r.status),
        }),
        body: v => {
            const c = carrier(v.empresa);
            return {
                fullName: text(v.nombre), nationalId: text(v.dni), phone: opt(v.tel), licenseNumber: text(v.licencia), licenseCategory: text(v.categoria) || 'A-I',
                isCompanyDriver: c.own, carrierSupplierId: c.id, status: statusOf(v.estado),
            };
        },
    },
    preciosProv: {
        path: '/supplier-products',
        row: r => {
            const p = byId('productos', r.product_id);
            return {
                prov: byId('proveedores', r.supplier_id)?.legal_name ?? '', prod: p?.name ?? '', sku: p?.sku ?? '', unidad: p?.unit ?? '',
                costo: num(r.unit_cost), skuProv: r.supplier_sku ?? '', notas: r.notes ?? '', estado: stateOf(r.status),
            };
        },
        body: v => {
            const supplierId = idByName('proveedores', 'legal_name', v.prov);
            const productId = idByName('productos', 'name', v.prod);
            if (!supplierId) bad('Selecciona un proveedor registrado.');
            if (!productId) bad('Selecciona un producto registrado.');
            if (!(num(v.costo) >= 0) || text(v.costo) === '') bad('Indica el precio de compra (S/, sin IGV).');
            return { supplierId, productId, supplierSku: opt(v.skuProv), unitCost: num(v.costo), notes: opt(v.notas), status: statusOf(v.estado) };
        },
    },
    vehiculos: {
        path: '/vehicles',
        row: r => {
            const drv = byId('conductores', r.default_driver_id);
            return {
                placa: r.plate, tipo: r.vehicle_type, marca: r.brand ?? '', modelo: r.model ?? '',
                capacidad: r.capacity != null ? `${num(r.capacity)}${r.capacity_unit ? ' ' + r.capacity_unit : ''}` : '',
                empresa: carrierLabel(!!r.is_company_vehicle, r.carrier_supplier_id), conductor_cod: drv?.code ?? '', conductor: drv ? driverLabel(drv) : NONE, estado: stateOf(r.status),
            };
        },
        body: v => {
            const c = carrier(v.empresa);
            const cap = capacity(v.capacidad);
            const drv = raw.conductores.find(d => driverLabel(d) === text(v.conductor));
            return {
                plate: text(v.placa).toUpperCase(), vehicleType: text(v.tipo) || 'Camión', brand: opt(v.marca), model: opt(v.modelo), capacity: cap.capacity, capacityUnit: cap.capacityUnit,
                isCompanyVehicle: c.own, carrierSupplierId: c.id, defaultDriverId: drv?.id ?? null, status: statusOf(v.estado),
            };
        },
    },
};

// ---------- espejo en el store local ----------

/** Reconstruye las filas locales a partir de lo que devolvió el backend. Va dentro de update(). */
function applyRows(d: DB) {
    for (const c of MASTER_COLLECTIONS) {
        if (!loaded.has(c)) continue;
        d.records[c] = raw[c].map(r => {
            const row = { ...SPECS[c].row(r), _id: localId(r.id) } as Row;
            // El costo promedio de un producto aún lo mueven las recepciones locales: no lo pises con 0.
            if (c === 'productos' && !row.costo) {
                const prev = d.records.productos.find(p => p.sku === row.sku);
                if (prev?.costo) row.costo = prev.costo;
            }
            return row;
        });
    }
}

function sortRaw(c: MasterCollection) {
    if (c === 'categorias' || c === 'almacenes') raw[c].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
}

function commit(c: MasterCollection, rec: Raw, effects?: (d: DB, row: Row) => void) {
    update(d => {
        if (effects) {
            try {
                effects(d, { ...SPECS[c].row(rec), _id: localId(rec.id) } as Row);
            } catch (e) {
                console.error(e);
            }
        }
        applyRows(d);
    });
}

function explain(e: unknown): string {
    if (e instanceof Invalid) return e.message;
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'El registro ya no existe en el servidor.';
        if (e.status === 409) return 'Ya existe un registro con el mismo código, documento, RUC, SKU, placa o nombre.';
        if (e.status === 429) return 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';
        if (/referenced record/i.test(e.message)) return 'Un dato relacionado ya no existe, o el registro está en uso.';
        if (/invalid value/i.test(e.message)) return 'Algún valor no es válido. Revisa los campos.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

// ---------- carga ----------

async function fetchAll(path: string, quiet = false): Promise<Raw[]> {
    const out: Raw[] = [];
    for (; ;) {
        const res = await api<{ items: Raw[]; total: number }>(`${path}?limit=200&offset=${out.length}`, { quiet });
        out.push(...res.items);
        if (!res.items.length || out.length >= res.total) return out;
    }
}

let pending: Promise<void> | null = null;

/** Respuesta cruda de /users de la última carga de maestros (Administración la reutiliza para no pedirla dos veces). */
export let usersRawFromMasters: Raw[] | null = null;

/** Descarga los maestros del backend y actualiza el espejo local. Si ya hay una carga en curso, la reutiliza. */
export function loadMasters(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            const [lists, userList] = await Promise.all([
                Promise.allSettled(MASTER_COLLECTIONS.map(c => fetchAll(SPECS[c].path, c === 'preciosProv'))),
                api<Raw[]>('/users').catch(() => null),
            ]);
            usersRawFromMasters = Array.isArray(userList) ? userList : null;
            users = Array.isArray(userList)
                ? userList.filter(u => u?.id).map(u => ({ id: String(u.id), name: String(u.fullName ?? ''), active: u.status !== 'INACTIVE' }))
                : [];
            lists.forEach((res, i) => {
                const c = MASTER_COLLECTIONS[i];
                if (res.status === 'fulfilled') {
                    raw[c] = res.value;
                    loaded.add(c);
                } else if (res.reason instanceof ApiError && res.reason.status === 403) {
                    // Sin permiso para ver este módulo: no hay nada que mostrar.
                    raw[c] = [];
                    loaded.add(c);
                }
                // Servidor caído: se conservan las filas que ya había.
            });
            update(applyRows);
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

// ---------- escritura ----------

export type Result = { ok: true; warning?: string } | { ok: false; error: string };
/** Efectos locales (auditoría, stock inicial…) que se aplican junto con el registro guardado. */
export type Effects = (d: DB, row: Row) => void;

export async function createMaster(c: MasterCollection, values: Vals, effects?: Effects): Promise<Result> {
    try {
        const rec = await api<Raw>(SPECS[c].path, { method: 'POST', body: SPECS[c].body(values) });
        raw[c].unshift(rec);
        sortRaw(c);
        commit(c, rec, effects);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function updateMaster(c: MasterCollection, localRowId: number, values: Vals, effects?: Effects): Promise<Result> {
    const uuid = uuids.get(localRowId);
    if (!uuid) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    try {
        const rec = await api<Raw>(`${SPECS[c].path}/${uuid}`, { method: 'PATCH', body: SPECS[c].body(values) });
        const i = raw[c].findIndex(r => r.id === rec.id);
        if (i >= 0) raw[c][i] = rec;
        else raw[c].unshift(rec);
        sortRaw(c);
        commit(c, rec, effects);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

/** Baja lógica: el maestro queda Inactivo (los documentos e historial que lo usan se conservan). */
export async function deactivateMaster(c: MasterCollection, localRowId: number, effects?: Effects): Promise<Result> {
    const uuid = uuids.get(localRowId);
    const rec = raw[c].find(r => r.id === uuid);
    if (!uuid || !rec) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    try {
        await api(`${SPECS[c].path}/${uuid}`, { method: 'DELETE' });
        rec.status = 'INACTIVE';
        commit(c, rec, effects);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}
// ---------- importación desde archivo ----------

/** `fields`: campos de la API con error (los manda el servidor) · `keys`: campos del formulario con error (para pintar la celda). */
export interface ImportRowResult { row: number; action: 'create' | 'update' | 'error'; errors: string[]; fields?: string[]; keys?: string[] }
export interface ImportResult { results: ImportRowResult[]; summary: { create: number; update: number; error: number }; saved: boolean }

const loose = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Busca un registro relacionado escrito a mano en el archivo: sin importar mayúsculas ni tildes,
 * y aceptando también su código, RUC/DNI o SKU. Devuelve el nombre exacto que espera el formulario.
 */
function refLabel(c: MasterCollection, value: string, label: (r: Raw) => string, ...alt: string[]): string | null {
    const v = loose(value);
    const r = raw[c].find(x => loose(label(x)) === v || alt.some(f => x[f] != null && loose(x[f]) === v));
    return r ? label(r) : null;
}

const OWN_WORDS = /^(|movilidad propia|propia|propio|empresa|nuestra|nuestro|si|interno)$/;

/** Referencias de cada pantalla: campo → cómo encontrarlo y qué decir si no existe. */
const REFS: Partial<Record<MasterCollection, Record<string, (v: string) => string | null>>> = {
    productos: {
        cat: v => refLabel('categorias', v, r => r.name, 'code'),
        prov: v => refLabel('proveedores', v, r => r.legal_name, 'tax_id', 'code'),
    },
    categorias: { padre: v => refLabel('categorias', v, r => r.name, 'code') },
    conductores: { empresa: v => (OWN_WORDS.test(loose(v)) ? OWN : refLabel('proveedores', v, r => r.legal_name, 'tax_id', 'code')) },
    vehiculos: {
        empresa: v => (OWN_WORDS.test(loose(v)) ? OWN : refLabel('proveedores', v, r => r.legal_name, 'tax_id', 'code')),
        conductor: v => refLabel('conductores', v, driverLabel, 'full_name', 'national_id', 'code'),
    },
    preciosProv: {
        prov: v => refLabel('proveedores', v, r => r.legal_name, 'tax_id', 'code'),
        prod: v => refLabel('productos', v, r => r.name, 'sku'),
    },
};
const REF_NAMES: Record<string, string> = { cat: 'la categoría', prov: 'el proveedor', padre: 'la categoría padre', empresa: 'el transportista', conductor: 'el conductor', prod: 'el producto' };
const USER_FIELDS: Partial<Record<MasterCollection, string>> = { clientes: 'vend', almacenes: 'resp' };

/**
 * Convierte una fila ya emparejada (claves del formulario) al cuerpo de la API, con las MISMAS reglas que el formulario.
 * Devuelve el problema de esa fila en vez de lanzarlo, para mostrarlo en la revisión.
 */
export function importBody(c: MasterCollection, vals: Record<string, string>, pending?: PendingRows): { body?: Record<string, unknown>; error?: string; keys?: string[] } {
    if (pending) return withPending(pending, () => importBody(c, vals));
    const v: Vals = { ...vals };
    if (c === 'clientes' && !text(v.tdoc) && text(v.ndoc)) {
        return { error: `El documento «${text(v.ndoc)}» no tiene 11 dígitos (RUC) ni 8 (DNI). Si es un DNI al que Excel le quitó el 0 inicial, agrega la columna «Tipo de documento» con DNI.`, keys: ['ndoc'] };
    }
    for (const [k, find] of Object.entries(REFS[c] ?? {})) {
        const given = text(v[k]);
        if (!given || given === NONE) continue;
        const hit = find(given);
        if (!hit) return { error: `No existe ${REF_NAMES[k] ?? k} «${given}». Cárgalo primero en Mantenimiento o corrige el nombre.`, keys: [k] };
        v[k] = hit;
    }
    const uf = USER_FIELDS[c];
    if (uf && text(v[uf])) {
        const u = users.find(x => loose(x.name) === loose(v[uf]));
        if (!u) return { error: `No existe el usuario «${text(v[uf])}».`, keys: [uf] };
        v[uf] = u.name;
    }
    try {
        return { body: SPECS[c].body(v) };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { error: msg, keys: MSG_KEYS.filter(([re]) => re.test(msg)).map(([, k]) => k).filter(k => k in vals).slice(0, 1) };
    }
}

/** Qué campo del formulario corresponde a cada mensaje de validación del formulario (para pintar la celda). */
const MSG_KEYS: [RegExp, string][] = [
    [/RUC|DNI/, 'ndoc'], [/RUC/, 'ruc'], [/[Cc]apacidad/, 'capacidad'], [/margen/i, 'margen'],
    [/transportista/, 'empresa'], [/proveedor/, 'prov'], [/producto/, 'prod'], [/precio de compra/, 'costo'],
];

/** Campos de la API (snake_case o camelCase) → campos del formulario, para marcar la celda con error. */
export function apiToFormKeys(c: MasterCollection, fields: string[]): string[] {
    const camel = (s: string) => s.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    const wanted = new Set(fields.map(camel));
    return Object.entries(FIELD_API[c]).filter(([, api]) => api.some(a => wanted.has(a))).map(([k]) => k);
}

/** Envía el lote al backend. `dryRun` solo valida; si no, guarda (todo o nada) y recarga los maestros. */
export async function importMaster(c: MasterCollection, bodies: Record<string, unknown>[], dryRun: boolean, fields: string[]): Promise<ImportResult> {
    try {
        const res = await api<ImportResult>(`${SPECS[c].path}/import`, { method: 'POST', body: { rows: bodies, dryRun, fields } });
        if (res.saved) await loadMasters();
        return res;
    } catch (e) {
        throw new Error(explain(e));
    }
}

/** Campo del formulario → campos de la API que llena. Al ACTUALIZAR por importación solo se tocan los que trae el archivo. */
const FIELD_API: Record<MasterCollection, Record<string, string[]>> = {
    clientes: { tdoc: ['documentType'], ndoc: ['documentNumber'], razon: ['legalName'], dir: ['fiscalAddress'], contacto: ['contactName'], tel: ['phone'], correo: ['billingEmail'], cond: ['paymentTermsDays'], linea: ['creditLimit'], vend: ['salespersonUserId'], estado: ['status'] },
    proveedores: { ruc: ['taxId'], rubro: ['businessCategory'], razon: ['legalName'], dir: ['address'], contacto: ['contactName'], tel: ['phone'], correo: ['email'], cond: ['paymentTermsDays'], cuenta: ['bankDetailsLabel'], estado: ['status'] },
    productos: { sku: ['sku'], nombre: ['name'], cat: ['categoryId'], unidad: ['unit'], igv: ['taxable'], precio: ['salePrice'], min: ['minimumStock'], prov: ['primarySupplierId'], estado: ['status'] },
    categorias: { nombre: ['name'], padre: ['parentCategoryId'], desc: ['description'], margen: ['targetMarginPct'], estado: ['status'] },
    almacenes: { nombre: ['name'], tipo: ['warehouseType'], dir: ['address'], distrito: ['district'], resp: ['managerUserId'], estado: ['status'] },
    conductores: { nombre: ['fullName'], dni: ['nationalId'], tel: ['phone'], licencia: ['licenseNumber'], categoria: ['licenseCategory'], empresa: ['isCompanyDriver', 'carrierSupplierId'], estado: ['status'] },
    vehiculos: { placa: ['plate'], tipo: ['vehicleType'], marca: ['brand'], modelo: ['model'], capacidad: ['capacity', 'capacityUnit'], empresa: ['isCompanyVehicle', 'carrierSupplierId'], conductor: ['defaultDriverId'], estado: ['status'] },
    preciosProv: { prov: ['supplierId'], prod: ['productId'], costo: ['unitCost'], notas: ['notes'], estado: ['status'] },
};

/** Campos de la API que vienen en el archivo (según las columnas emparejadas). */
export function importFields(c: MasterCollection, mappedKeys: string[]): string[] {
    return [...new Set(mappedKeys.flatMap(k => FIELD_API[c][k] ?? []))];
}

// ---------- importación general (varias hojas en un mismo archivo) ----------

/**
 * Ids provisionales de registros que vienen en otra hoja del mismo archivo y aún no se guardaron.
 * Cada registro tiene el SUYO: si todos compartieran uno, el servidor vería «proveedor + producto» repetidos.
 */
const PENDING_PREFIX = '00000000-0000-4000-8000-';
let pendingSeq = 0;
const nextPendingId = () => PENDING_PREFIX + (++pendingSeq).toString(16).padStart(12, '0');
/** Registros que vienen en el archivo, por tabla, con los campos que usan las referencias. */
export type PendingRows = Partial<Record<MasterCollection, Raw[]>>;

/** Registro provisional (solo para resolver referencias) a partir de una fila ya limpia del archivo. */
export function pendingRow(c: MasterCollection, v: Record<string, string>): Raw | null {
    const id = nextPendingId();
    switch (c) {
        case 'categorias': return v.nombre ? { id, name: v.nombre } : null;
        case 'proveedores': return v.razon || v.ruc ? { id, legal_name: v.razon, tax_id: v.ruc } : null;
        case 'productos': return v.nombre || v.sku ? { id, name: v.nombre, sku: v.sku } : null;
        case 'conductores': return v.nombre || v.dni ? { id, full_name: v.nombre, national_id: v.dni } : null;
        default: return null;
    }
}

/** Ejecuta `fn` como si los registros pendientes ya existieran (se quitan al terminar). */
function withPending<T>(pending: PendingRows, fn: () => T): T {
    const added: [MasterCollection, number][] = [];
    for (const [c, rows] of Object.entries(pending) as [MasterCollection, Raw[]][]) {
        // Lo que ya existe en el servidor tiene prioridad: el provisional va al final.
        raw[c].push(...rows);
        added.push([c, rows.length]);
    }
    try {
        return fn();
    } finally {
        for (const [c, n] of added) raw[c].splice(raw[c].length - n, n);
    }
}

/** true si la fila apunta a algo que todavía no está guardado (se importa en una segunda pasada). */
export const usesPending = (body: Record<string, unknown> | undefined) => !!body && JSON.stringify(body).includes(PENDING_PREFIX);