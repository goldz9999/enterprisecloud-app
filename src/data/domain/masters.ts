import { api, ApiError } from '../../lib/api';
import { update } from '../store';
import type { DB, Row, Value } from '../types';

/**
 * Maestros de Mantenimiento (clientes, proveedores, productos, categorías, almacenes, conductores y vehículos).
 * La fuente de verdad es el backend (Supabase). El store local (`d.records.*`) es solo un espejo para que el resto
 * de la app (órdenes, flujos, reportes…) siga leyendo `d.records.clientes`, etc. sin cambios.
 */

export const MASTER_COLLECTIONS = ['clientes', 'proveedores', 'productos', 'categorias', 'almacenes', 'conductores', 'vehiculos'] as const;
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

const raw: Record<MasterCollection, Raw[]> = { clientes: [], proveedores: [], productos: [], categorias: [], almacenes: [], conductores: [], vehiculos: [] };
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

/** Almacenes del backend, para el almacén por defecto de Configuración. */
export const warehouseIdByName = (name: string): string | null => idByName('almacenes', 'name', name);
export const warehouseNameById = (id: unknown): string => String(byId('almacenes', id)?.name ?? '');

/** Nombres de usuarios del backend (para vendedor / responsable). */
export const masterUserNames = (): string[] => [NONE, ...users.filter(u => u.active).map(u => u.name)];

function carrier(v: Value | undefined): { own: boolean; id: string | null } {
    const n = text(v);
    if (!n || n === OWN) return { own: true, id: null };
    const id = idByName('proveedores', 'legal_name', n);
    if (!id) bad('Selecciona un transportista registrado en Proveedores.');
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

async function fetchAll(path: string): Promise<Raw[]> {
    const out: Raw[] = [];
    for (; ;) {
        const res = await api<{ items: Raw[]; total: number }>(`${path}?limit=200&offset=${out.length}`);
        out.push(...res.items);
        if (!res.items.length || out.length >= res.total) return out;
    }
}

let pending: Promise<void> | null = null;

/** Descarga los maestros del backend y actualiza el espejo local. Si ya hay una carga en curso, la reutiliza. */
export function loadMasters(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            const [lists, userList] = await Promise.all([
                Promise.allSettled(MASTER_COLLECTIONS.map(c => fetchAll(SPECS[c].path))),
                api<Raw[]>('/users').catch(() => null),
            ]);
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