import { getSession, setSession } from '../data/session';
import { CLIENT_ID } from './clientId';
import { noteLoad } from './loadStatus';

/** Base URL of the FastAPI backend (see .env.example). */
export const API_URL = String(import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

interface Options {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    /** Send the session token (default). Login is the only call that doesn't. */
    auth?: boolean;
    /** No avisar "no se pudieron cargar algunos datos" si esta lectura falla (datos opcionales, p. ej. una tabla aún no creada). */
    quiet?: boolean;
    /** Use this token instead of the current session's (e.g. to revoke it right after clearing the session). */
    token?: string;
}

/** Pausas antes de reintentar una lectura que falló por causas transitorias. */
const RETRY_DELAYS_MS = [400, 1200];

/** Sin conexión o error del servidor. Un 429 (límite por minuto) no se reintenta: la ventana dura 60 s y solo sumaría peticiones. */
const isTransient = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500);
const isLoadFailure = (e: unknown) => isTransient(e) || (e instanceof ApiError && e.status === 429);

/**
 * Calls the backend. Throws ApiError (status 0 = server unreachable). A 401 on a signed-in call ends the session.
 * Las lecturas (GET) se reintentan ante fallos transitorios; si siguen fallando se registran en `loadStatus` para avisar al usuario.
 */
export async function api<T = void>(path: string, opts: Options = {}): Promise<T> {
    if ((opts.method ?? 'GET') !== 'GET') return request<T>(path, opts);
    const key = path.split('?')[0];
    for (let attempt = 0; ; attempt++) {
        try {
            const out = await request<T>(path, opts);
            noteLoad(key, true);
            return out;
        } catch (e) {
            if (!isTransient(e) || attempt >= RETRY_DELAYS_MS.length) {
                if (isLoadFailure(e) && !opts.quiet) noteLoad(key, false);
                throw e;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
    }
}

async function request<T>(path: string, { method = 'GET', body, auth = true, token }: Options): Promise<T> {
    const sent = token ?? (auth ? getSession()?.token : undefined);
    const headers: Record<string, string> = { 'X-Client-Id': CLIENT_ID };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    // With FormData the browser sets the multipart Content-Type (and its boundary) itself.
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (sent) headers.Authorization = `Bearer ${sent}`;

    let res: Response;
    try {
        res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
    } catch {
        throw new ApiError(0, 'No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);

    if (!res.ok) {
        // Expired or revoked token: drop the session so the guard sends the user to /login.
        if (res.status === 401 && sent && getSession()?.token === sent) setSession(null);
        const raw = data?.message;
        const message = Array.isArray(raw) ? raw.join(' · ') : typeof raw === 'string' ? raw : 'Error del servidor';
        throw new ApiError(res.status, message, typeof data?.code === 'string' ? data.code : undefined);
    }
    return data as T;
}