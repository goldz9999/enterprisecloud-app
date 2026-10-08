import { api, ApiError } from '../../lib/api';
import { fmtDayTime, fmtTime } from '../../lib/dates';
import { MODULES, MODULE_KEYS } from '../permissions';
import { getDB, update } from '../store';
import type { AuditEvent, DB, PermMatrix, Row, Settings, Value } from '../types';
import { refreshSession } from './auth';
import { loadMasters, warehouseIdByName, warehouseNameById, type Effects, type Result } from './masters';

/**
 * Administración: usuarios, roles, permisos, configuración y auditoría.
 * La fuente de verdad es el backend (Supabase). El store local (`d.records.usuarios`, `d.records.roles`,
 * `d.permisos`, `d.settings`) es un espejo para que el resto de la app siga leyéndolo sin cambios.
 */

export const ADMIN_COLLECTIONS = ['usuarios', 'roles'] as const;
export type AdminCollection = (typeof ADMIN_COLLECTIONS)[number];

export function isAdminCollection(c: string | undefined): c is AdminCollection {
    return !!c && (ADMIN_COLLECTIONS as readonly string[]).includes(c);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
type Vals = Record<string, Value>;

const NONE = '—';
const NO_BASE = '— Ninguno —';
const ADMIN_CODE = 'ADMIN';
const ACTION_KEYS = ['view', 'create', 'edit', 'delete', 'approve'];
const MODULE_LABELS = MODULES.flatMap(([, ms]) => ms);
const LABEL_OF_KEY = Object.fromEntries(Object.entries(MODULE_KEYS).map(([label, key]) => [key, label]));

class Invalid extends Error { }
function bad(message: string): never {
    throw new Invalid(message);
}

const text = (v: Value | undefined) => String(v ?? '').trim();
const opt = (v: Value | undefined) => text(v) || null;

// ---------- errores ----------

const MESSAGES: [RegExp, string][] = [
    [/change the status of your own account/i, 'No puedes cambiar el estado de tu propia cuenta.'],
    [/change the role of your own account/i, 'No puedes cambiar el rol de tu propia cuenta.'],
    [/change-password/i, 'Para cambiar tu propia contraseña usa tu menú de cuenta.'],
    [/only administrators can assign/i, 'Solo un Administrador puede asignar el rol Administrador.'],
    [/only administrators can manage/i, 'Solo un Administrador puede gestionar cuentas de Administrador.'],
    [/role is inactive/i, 'El rol seleccionado está inactivo.'],
    [/administrator role cannot be deactivated/i, 'El rol Administrador no se puede desactivar.'],
    [/administrator role always has full access/i, 'El rol Administrador tiene acceso total y no se puede modificar.'],
    [/user not found/i, 'El usuario ya no existe.'],
    [/role not found/i, 'El rol ya no existe.'],
    [/not initialised/i, 'La configuración de la empresa no está inicializada. Ejecuta en el backend: python -m scripts.seed'],
    [/^email:/i, 'El correo no es válido.'],
    [/password:.*(at least|short)/i, 'La contraseña debe tener al menos 8 caracteres.'],
];

function explain(e: unknown, kind: 'usuario' | 'rol' | 'configuración' = 'usuario'): string {
    if (e instanceof Invalid) return e.message;
    if (e instanceof ApiError) {
        if (e.status === 0) return e.message;
        const known = MESSAGES.find(([re]) => re.test(e.message));
        if (known) return known[1];
        if (e.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.status === 404) return 'El registro ya no existe en el servidor.';
        if (e.status === 409) return kind === 'usuario' ? 'Ya existe un usuario con ese correo.' : 'Ya existe un rol con ese nombre o código.';
        if (e.status === 429) return 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';
        return e.message.replace(/Value error, /g, '');
    }
    return 'Ocurrió un error inesperado.';
}

// ---------- cache de datos del backend ----------

let rawUsers: Raw[] = [];
let rawRoles: Raw[] = [];
let usersLoaded = false;
let rolesLoaded = false;
let perms: PermMatrix = {};
let permsLoaded = false;

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

const USER_STATUS: Record<string, string> = { ACTIVE: 'Activo', INVITED: 'Sin confirmar', LOCKED: 'Bloqueado', INACTIVE: 'Inactivo' };
const statusCode = (label: string) => Object.entries(USER_STATUS).find(([, v]) => v === label)?.[0] ?? 'ACTIVE';

function lastAccess(iso: unknown): string {
    if (!iso) return 'Nunca';
    const t = new Date(String(iso));
    return t.toDateString() === new Date().toDateString() ? `Hoy ${fmtTime(t)}` : fmtDayTime(t);
}

const roleRow = (r: Raw): Vals => ({
    nombre: r.name, desc: r.description ?? '', usuarios: 0, modulos: '', tipo: r.roleType === 'SYSTEM' ? 'Sistema' : 'Personalizado',
    estado: r.isActive ? 'Activo' : 'Inactivo', base: NONE,
});

const userRow = (u: Raw): Vals => ({
    nombre: u.fullName, correo: u.email, rol: u.role?.name ?? '', area: u.area ?? '', acceso: lastAccess(u.lastLoginAt),
    mfa: u.mfaEnabled ? 'Activado' : 'Desactivado', estado: USER_STATUS[u.status] ?? 'Activo',
});

/** Permisos de un rol como matriz módulo → [ver, crear, editar, eliminar, aprobar]. */
function matrixOf(grants: Raw[], admin: boolean): Record<string, boolean[]> {
    const out: Record<string, boolean[]> = {};
    for (const label of MODULE_LABELS) out[label] = ACTION_KEYS.map(() => admin);
    if (!admin) {
        for (const g of grants) {
            if (!g.granted) continue;
            const label = LABEL_OF_KEY[g.permission?.moduleKey];
            const i = ACTION_KEYS.indexOf(g.permission?.actionKey);
            if (label && i >= 0) out[label][i] = true;
        }
    }
    return out;
}

function permissionsBody(matrix: Record<string, boolean[]>) {
    const out: Record<string, string[]> = {};
    for (const label of MODULE_LABELS) {
        const key = MODULE_KEYS[label];
        const row = matrix[label];
        if (!key || !row) continue;
        const actions = ACTION_KEYS.filter((_, i) => row[i]);
        if (actions.length) out[key] = actions;
    }
    return { permissions: out };
}

/** Reconstruye usuarios, roles y matriz de permisos locales con lo que devolvió el backend. Va dentro de update(). */
function applyAdmin(d: DB) {
    if (rolesLoaded) d.records.roles = rawRoles.map(r => ({ ...roleRow(r), _id: localId(r.id) }) as Row);
    if (usersLoaded) d.records.usuarios = rawUsers.map(u => ({ ...userRow(u), _id: localId(u.id) }) as Row);
    if (permsLoaded) d.permisos = structuredClone(perms);
}

// ---------- configuración de la empresa ----------

interface SettingMap {
    local: string;
    remote: string;
    /** Valor del backend → valor del formulario. */
    to: (v: unknown) => Value | boolean;
    /** Valor del formulario → valor para el backend. */
    from: (v: Value | boolean | undefined) => unknown;
}

const s = (v: unknown) => (v == null ? '' : String(v));
const t = (v: Value | boolean | undefined) => String(v ?? '').trim();
const int = (v: Value | boolean | undefined) => parseInt(t(v), 10) || 0;
const plural = (n: unknown, one: string, many: string) => (Number(n) === 1 ? `1 ${one}` : `${Number(n)} ${many}`);

const SETTING_MAP: SettingMap[] = [
    { local: 'ruc', remote: 'taxId', to: s, from: t },
    { local: 'razon', remote: 'legalName', to: s, from: t },
    { local: 'dir', remote: 'fiscalAddress', to: s, from: v => t(v) || null },
    { local: 'moneda', remote: 'currency', to: v => (v === 'USD' ? 'Dólares (USD)' : 'Soles (PEN)'), from: v => (/USD/.test(t(v)) ? 'USD' : 'PEN') },
    { local: 'zona', remote: 'timeZone', to: v => (v === 'America/Lima' ? 'America/Lima (UTC−5)' : s(v)), from: v => t(v).replace(/\s*\(.*\)\s*$/, '') },
    { local: 'sf', remote: 'invoiceSeries', to: s, from: t },
    { local: 'sb', remote: 'receiptSeries', to: s, from: t },
    { local: 'sg', remote: 'dispatchSeries', to: s, from: t },
    { local: 'snc', remote: 'creditNoteSeries', to: s, from: t },
    { local: 'auto', remote: 'autoTaxSubmission', to: v => !!v, from: v => !!v },
    { local: 'mail', remote: 'emailDocuments', to: v => !!v, from: v => !!v },
    {
        local: 'igv', remote: 'taxRate',
        to: v => {
            const n = Number(v);
            if (n === 0) return 'Exonerado';
            if (Math.abs(n - 0.18) < 1e-9) return '18%';
            if (Math.abs(n - 0.1) < 1e-9) return '10% (MYPE restaurantes)';
            return `${+(n * 100).toFixed(2)}%`;
        },
        from: v => {
            if (t(v) === 'Exonerado') return 0;
            const m = /(\d+(?:[.,]\d+)?)/.exec(t(v));
            return m ? Number(m[1].replace(',', '.')) / 100 : 0.18;
        },
    },
    { local: 'incl', remote: 'pricesIncludeTax', to: v => (v ? 'Incluyen IGV' : 'No incluyen IGV'), from: v => t(v) === 'Incluyen IGV' },
    { local: 'desc', remote: 'maxDiscountPct', to: v => `${Number(v)}%`, from: v => parseFloat(t(v)) || 0 },
    { local: 'vcot', remote: 'quotationValidityDays', to: v => `${Number(v)} días`, from: v => int(v) || 14 },
    { local: 'almdef', remote: 'defaultWarehouseId', to: v => warehouseNameById(v), from: v => (t(v) ? warehouseIdByName(t(v)) : null) },
    { local: 'neg', remote: 'allowNegativeStock', to: v => !!v, from: v => !!v },
    { local: 'alert', remote: 'reorderAlertsEnabled', to: v => !!v, from: v => !!v },
    { local: 'ses', remote: 'sessionDurationHours', to: v => `${Number(v)} horas`, from: v => int(v) || 8 },
    { local: 'int', remote: 'maxLoginAttempts', to: v => String(Number(v)), from: v => int(v) || 5 },
    { local: 'mfa', remote: 'mfaRequired', to: v => !!v, from: v => !!v },
    { local: 'aud', remote: 'auditRetentionYears', to: v => plural(v, 'año', 'años'), from: v => int(v) || 5 },
];

let settingsRaw: Raw | null = null;

const settingsFrom = (raw: Raw): Settings => Object.fromEntries(SETTING_MAP.map(m => [m.local, m.to(raw[m.remote]) as string | boolean]));

/** Guarda la configuración: lo que vive en el backend se envía al servidor; lo demás (apariencia, cuentas) queda local. */
export async function saveSettings(form: Settings): Promise<Result> {
    const current = getDB().settings;
    const patch: Record<string, unknown> = {};
    for (const m of SETTING_MAP) if (form[m.local] !== current[m.local]) patch[m.remote] = m.from(form[m.local]);
    const localKeys = Object.keys(form).filter(k => !SETTING_MAP.some(m => m.local === k));
    try {
        if (Object.keys(patch).length) settingsRaw = await api<Raw>('/settings', { method: 'PATCH', body: patch });
        const raw = settingsRaw;
        update(d => {
            d.settings = { ...d.settings, ...Object.fromEntries(localKeys.map(k => [k, form[k]])) };
            if (raw) d.settings = { ...d.settings, ...settingsFrom(raw) };
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e, 'configuración') };
    }
}

// ---------- carga ----------

async function loadPermissions() {
    const results = await Promise.allSettled(rawRoles.map(r => (r.code === ADMIN_CODE ? Promise.resolve(null) : api<Raw>(`/roles/${r.id}/permissions`))));
    const next: PermMatrix = {};
    let ok = true;
    results.forEach((res, i) => {
        const r = rawRoles[i];
        if (r.code === ADMIN_CODE) next[r.name] = matrixOf([], true);
        else if (res.status === 'fulfilled') next[r.name] = matrixOf(res.value?.permissions ?? [], false);
        else ok = false;
    });
    if (ok) {
        perms = next;
        permsLoaded = true;
    }
}

const forbidden = (e: unknown) => e instanceof ApiError && e.status === 403;

async function refreshUsers() {
    rawUsers = await api<Raw[]>('/users');
    usersLoaded = true;
    update(applyAdmin);
}

async function refreshRoles() {
    rawRoles = await api<Raw[]>('/roles');
    rolesLoaded = true;
    await loadPermissions();
    update(applyAdmin);
}

let pending: Promise<void> | null = null;

/** Descarga usuarios, roles, permisos y configuración del backend. Si ya hay una carga en curso, la reutiliza. */
export function loadAdmin(): Promise<void> {
    if (!pending) {
        pending = (async () => {
            await loadMasters().catch(() => undefined); // la configuración necesita los almacenes para mostrar el almacén por defecto
            const [u, r, c] = await Promise.allSettled([api<Raw[]>('/users'), api<Raw[]>('/roles'), api<Raw>('/settings')]);
            if (u.status === 'fulfilled') {
                rawUsers = u.value;
                usersLoaded = true;
            } else if (forbidden(u.reason)) {
                rawUsers = [];
                usersLoaded = true;
            }
            if (r.status === 'fulfilled') {
                rawRoles = r.value;
                rolesLoaded = true;
            } else if (forbidden(r.reason)) {
                rawRoles = [];
                rolesLoaded = true;
            }
            if (c.status === 'fulfilled') settingsRaw = c.value;
            if (rolesLoaded && rawRoles.length) await loadPermissions();
            update(d => {
                applyAdmin(d);
                if (settingsRaw) d.settings = { ...d.settings, ...settingsFrom(settingsRaw) };
            });
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

// ---------- usuarios ----------

export async function createUser(values: Vals): Promise<Result> {
    try {
        const role = rawRoles.find(r => r.name === text(values.rol));
        if (!role) bad('Selecciona un rol.');
        const password = String(values.clave ?? '');
        if (password.length < 8) bad('La contraseña inicial debe tener al menos 8 caracteres.');
        const created = await api<Raw>('/users', {
            method: 'POST',
            body: { fullName: text(values.nombre), email: text(values.correo).toLowerCase(), password, roleId: role.id, area: opt(values.area) },
        });
        // Un usuario nuevo nace "Sin confirmar" (se activa al iniciar sesión por primera vez).
        const wanted = statusCode(text(values.estado));
        let warning: string | undefined;
        if (wanted !== 'INVITED') {
            try {
                await api(`/users/${created.id}/status`, { method: 'PATCH', body: { status: wanted } });
            } catch (e) {
                warning = `Usuario creado, pero no se pudo asignar el estado: ${explain(e)}`;
            }
        }
        await refreshUsers();
        return { ok: true, warning };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

export async function updateUser(localRowId: number, values: Vals): Promise<Result> {
    const uuid = uuids.get(localRowId);
    const before = rawUsers.find(u => u.id === uuid);
    if (!uuid || !before) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };

    const steps: (() => Promise<unknown>)[] = [];
    try {
        const patch: Record<string, unknown> = {};
        const name = text(values.nombre);
        const email = text(values.correo).toLowerCase();
        const area = text(values.area);
        if (name !== before.fullName) patch.fullName = name;
        if (email !== String(before.email).toLowerCase()) patch.email = email;
        if (area !== (before.area ?? '')) patch.area = area || null;
        if (Object.keys(patch).length) steps.push(() => api(`/users/${uuid}`, { method: 'PATCH', body: patch }));

        const role = rawRoles.find(r => r.name === text(values.rol));
        if (role && role.id !== before.roleId) steps.push(() => api(`/users/${uuid}/role`, { method: 'PATCH', body: { roleId: role.id } }));

        const wanted = statusCode(text(values.estado));
        if (text(values.estado) === 'Sin confirmar' && before.status !== 'INVITED') bad('Un usuario ya confirmado no puede volver a "Sin confirmar". Elige Activo, Bloqueado o Inactivo.');
        if (wanted !== 'INVITED' && wanted !== before.status) steps.push(() => api(`/users/${uuid}/status`, { method: 'PATCH', body: { status: wanted } }));

        const password = String(values.reset ?? '');
        if (password) {
            if (password.length < 8) bad('La nueva contraseña debe tener al menos 8 caracteres.');
            steps.push(() => api(`/users/${uuid}/reset-password`, { method: 'POST', body: { newPassword: password } }));
        }
    } catch (e) {
        return { ok: false, error: explain(e) };
    }

    let done = 0;
    try {
        for (const step of steps) {
            await step();
            done++;
        }
        if (steps.length) await refreshUsers();
        return { ok: true };
    } catch (e) {
        await refreshUsers().catch(() => undefined);
        const msg = explain(e);
        return { ok: false, error: done ? `Se guardaron parte de los cambios, pero: ${msg}` : msg };
    }
}

/** Baja lógica: el usuario queda Inactivo (no se elimina para conservar la auditoría). */
export async function deactivateUser(localRowId: number): Promise<Result> {
    const uuid = uuids.get(localRowId);
    const before = rawUsers.find(u => u.id === uuid);
    if (!uuid || !before) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    if (before.status === 'INACTIVE') return { ok: true };
    try {
        await api(`/users/${uuid}/status`, { method: 'PATCH', body: { status: 'INACTIVE' } });
        await refreshUsers();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e) };
    }
}

// ---------- roles ----------

function roleCode(name: string): string {
    const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (base.length < 2) bad('El nombre del rol debe tener al menos 2 letras o números.');
    let code = base.slice(0, 40);
    for (let n = 2; rawRoles.some(r => r.code === code); n++) code = `${base.slice(0, 36)}_${n}`;
    return code;
}

export async function createRole(values: Vals): Promise<Result> {
    try {
        const name = text(values.nombre);
        if (name.length < 2) bad('El nombre del rol debe tener al menos 2 caracteres.');
        const created = await api<Raw>('/roles', { method: 'POST', body: { code: roleCode(name), name, description: opt(values.desc) } });
        // Un rol nuevo nace sin permisos; si se eligió un rol base se le copian sus permisos.
        const base = text(values.base);
        let warning: string | undefined;
        if (base && base !== NO_BASE && perms[base]) {
            try {
                await api(`/roles/${created.id}/permissions`, { method: 'PUT', body: permissionsBody(perms[base]) });
            } catch (e) {
                warning = `Rol creado, pero no se pudieron copiar los permisos: ${explain(e, 'rol')}`;
            }
        }
        await refreshRoles();
        return { ok: true, warning };
    } catch (e) {
        return { ok: false, error: explain(e, 'rol') };
    }
}

async function patchRole(localRowId: number, patch: Record<string, unknown>): Promise<Result> {
    const uuid = uuids.get(localRowId);
    if (!uuid) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    try {
        if (Object.keys(patch).length) {
            await api(`/roles/${uuid}`, { method: 'PATCH', body: patch });
            await refreshRoles();
            await refreshUsers().catch(() => undefined); // los usuarios muestran el nombre del rol
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: explain(e, 'rol') };
    }
}

function checkDeactivate(role: Raw) {
    if (role.code === ADMIN_CODE) bad('El rol Administrador no se puede desactivar.');
    if (role.roleType === 'SYSTEM') bad('Los roles de tipo Sistema no se pueden desactivar.');
    if (rawUsers.some(u => u.roleId === role.id && u.status !== 'INACTIVE')) bad('Hay usuarios activos con este rol. Asígnales otro rol antes de desactivarlo.');
}

export async function updateRole(localRowId: number, values: Vals): Promise<Result> {
    const before = rawRoles.find(r => r.id === uuids.get(localRowId));
    if (!before) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    try {
        const patch: Record<string, unknown> = {};
        const name = text(values.nombre);
        if (name !== before.name) {
            if (before.roleType === 'SYSTEM') bad('Los roles de tipo Sistema no se pueden renombrar.');
            patch.name = name;
        }
        if (text(values.desc) !== (before.description ?? '')) patch.description = opt(values.desc);
        const active = text(values.estado) !== 'Inactivo';
        if (active !== before.isActive) {
            if (!active) checkDeactivate(before);
            patch.isActive = active;
        }
        return await patchRole(localRowId, patch);
    } catch (e) {
        return { ok: false, error: explain(e, 'rol') };
    }
}

export async function deactivateRole(localRowId: number): Promise<Result> {
    const before = rawRoles.find(r => r.id === uuids.get(localRowId));
    if (!before) return { ok: false, error: 'El registro ya no existe. Recarga la página.' };
    if (!before.isActive) return { ok: true };
    try {
        checkDeactivate(before);
    } catch (e) {
        return { ok: false, error: explain(e, 'rol') };
    }
    return patchRole(localRowId, { isActive: false });
}

// ---------- alta / edición / baja por colección ----------

export const createAdmin = (c: AdminCollection, values: Vals, _effects?: Effects): Promise<Result> => (c === 'usuarios' ? createUser(values) : createRole(values));
export const updateAdmin = (c: AdminCollection, id: number, values: Vals, _effects?: Effects): Promise<Result> => (c === 'usuarios' ? updateUser(id, values) : updateRole(id, values));
export const deactivateAdmin = (c: AdminCollection, id: number, _effects?: Effects): Promise<Result> => (c === 'usuarios' ? deactivateUser(id) : deactivateRole(id));

// ---------- permisos ----------

/** Guarda la matriz de los roles indicados (el Administrador siempre tiene acceso total y no se envía). */
export async function saveRolePermissions(matrix: PermMatrix, roleNames: string[]): Promise<Result> {
    try {
        for (const name of roleNames) {
            const role = rawRoles.find(r => r.name === name);
            if (!role || role.code === ADMIN_CODE) continue;
            await api(`/roles/${role.id}/permissions`, { method: 'PUT', body: permissionsBody(matrix[name] ?? {}) });
        }
        await loadPermissions();
        update(applyAdmin);
        await refreshSession(); // por si cambiaron los permisos del rol del usuario actual
        return { ok: true };
    } catch (e) {
        await loadPermissions().catch(() => undefined);
        update(applyAdmin);
        return { ok: false, error: explain(e, 'rol') };
    }
}

// ---------- auditoría ----------

const AUDIT_ACTION: Record<string, AuditEvent['action']> = { LOGIN: 'Ingreso', CREATE: 'Crear', EDIT: 'Editar', DELETE: 'Eliminar', EXPORT: 'Exportar', DOWNLOAD: 'Descargar' };
const AUDIT_RESULT: Record<string, AuditEvent['result']> = { SUCCESS: 'Exitoso', FAILURE: 'Fallido', DENIED: 'Denegado' };

function moduleLabel(key: string): string {
    if (key === 'security') return 'Seguridad';
    const label = LABEL_OF_KEY[key];
    if (!label) return key;
    const group = MODULES.find(([, ms]) => ms.includes(label))?.[0] ?? label;
    return group === 'Sistema' ? 'Administración' : group;
}

function deviceOf(ua: unknown): string {
    const s = String(ua ?? '');
    if (!s) return '—';
    const browser = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : s.slice(0, 40);
    const os = /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'macOS' : /Android/.test(s) ? 'Android' : /Linux/.test(s) ? 'Linux' : '';
    return os ? `${browser} · ${os}` : browser;
}

/** Eventos de auditoría registrados por el backend (los más recientes primero). */
export async function fetchAuditEvents(max = 600): Promise<AuditEvent[]> {
    const out: Raw[] = [];
    for (; ;) {
        const res = await api<{ items: Raw[]; total: number }>(`/audit?limit=200&offset=${out.length}`);
        out.push(...res.items);
        if (!res.items.length || out.length >= res.total || out.length >= max) break;
    }
    return out.map(e => ({
        id: `AUD-${String(e.id).slice(0, 8).toUpperCase()}`,
        at: e.occurredAt,
        user: e.userNameSnapshot,
        role: e.roleNameSnapshot ?? '',
        action: AUDIT_ACTION[e.action] ?? 'Editar',
        module: moduleLabel(e.moduleKey),
        ref: e.referenceSnapshot ?? e.entityType ?? '',
        desc: e.description,
        result: AUDIT_RESULT[e.result] ?? 'Exitoso',
        changes: Array.isArray(e.changes) ? e.changes.map((c: unknown[]) => [String(c[0]), String(c[1]), String(c[2])] as [string, string, string]) : [],
        note: e.detail ?? '',
        ip: e.ip ?? '—',
        device: deviceOf(e.device),
    }));
}

export function auditError(e: unknown): string {
    if (e instanceof ApiError && e.status === 403) return 'No tienes permiso para ver los eventos registrados en el servidor.';
    if (e instanceof ApiError) return e.message;
    return 'No se pudieron cargar los eventos del servidor.';
}