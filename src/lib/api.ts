import { getSession, setSession } from '../data/session';

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
    /** Use this token instead of the current session's (e.g. to revoke it right after clearing the session). */
    token?: string;
}

/** Calls the backend. Throws ApiError (status 0 = server unreachable). A 401 on a signed-in call ends the session. */
export async function api<T = void>(path: string, { method = 'GET', body, auth = true, token }: Options = {}): Promise<T> {
    const sent = token ?? (auth ? getSession()?.token : undefined);
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (sent) headers.Authorization = `Bearer ${sent}`;

    let res: Response;
    try {
        res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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