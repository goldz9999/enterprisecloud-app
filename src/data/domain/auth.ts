import { api, ApiError } from '@/shared/lib/api';
import { getSession, patchSession, setSession, type PermissionMap, type SessionUser } from '../session';

/** Initial password shown by the (still local) Usuarios screen. Real accounts are managed by the backend. */
export const INITIAL_PASSWORD = 'demo1234';

export type LoginResult = { ok: true } | { ok: false; error: string; locked?: boolean };

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: SessionUser & { roleId: string; status: string };
  permissions: PermissionMap;
}

type MeResponse = SessionUser & { roleId: string; status: string; permissions: PermissionMap };

/** Token expiry in epoch ms, read from the JWT payload (the server is still the one that enforces it). */
function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    /* fall through */
  }
  return Date.now() + 8 * 3600000;
}

function toSessionUser(u: SessionUser): SessionUser {
  return { id: u.id, fullName: u.fullName, email: u.email, area: u.area ?? null, lastLoginAt: u.lastLoginAt ?? null, role: { id: u.role.id, code: u.role.code, name: u.role.name } };
}

function loginError(e: unknown): LoginResult {
  if (!(e instanceof ApiError)) return { ok: false, error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' };
  if (e.code === 'ACCOUNT_LOCKED') return { ok: false, locked: true, error: 'Cuenta bloqueada. Pide al Administrador que la desbloquee en Administración › Usuarios.' };
  if (e.code === 'ACCOUNT_INACTIVE') return { ok: false, error: 'Tu cuenta está inactiva. Contacta al Administrador.' };
  switch (e.status) {
    case 0: return { ok: false, error: e.message };
    case 401: return { ok: false, error: 'Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea.' };
    case 400: return { ok: false, error: 'Revisa el correo y la contraseña ingresados.' };
    case 429: return { ok: false, error: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' };
    default: return { ok: false, error: 'El servidor no pudo procesar la solicitud. Inténtalo más tarde.' };
  }
}

/** Signs in against the backend (users, roles and permissions live in Supabase). */
export async function login(email: string, password: string, remember = true): Promise<LoginResult> {
  try {
    const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password }, auth: false });
    setSession(
      {
        email: res.user.email,
        since: new Date().toISOString(),
        token: res.accessToken,
        expiresAt: tokenExpiry(res.accessToken),
        user: toSessionUser(res.user),
        permissions: res.permissions,
      },
      remember,
    );
    return { ok: true };
  } catch (e) {
    return loginError(e);
  }
}

/** Re-reads the user and permissions from the backend (a 401 ends the session). */
export async function refreshSession(): Promise<void> {
  if (!getSession()) return;
  try {
    const { permissions, ...user } = await api<MeResponse>('/auth/me');
    patchSession({ user: toSessionUser(user), permissions });
  } catch {
    // 401 already cleared the session; other failures (offline) keep what we have.
  }
}

/** `explicit`: the user chose to sign out (the next sign-in starts at the Dashboard). */
export function logout(explicit = false) {
  const token = getSession()?.token;
  setSession(null, true, explicit);
  // Revoke the session on the server; if it fails the token still expires on its own.
  if (token) api('/auth/logout', { method: 'POST', token }).catch(() => { });
}

/** Changes the signed-in user's password. Returns an error message, or undefined on success. */
export async function changePassword(current: string, next: string): Promise<string | undefined> {
  if (!current) return 'Ingresa tu contraseña actual.';
  if (next.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
  } catch (e) {
    if (!(e instanceof ApiError)) return 'Ocurrió un error inesperado.';
    if (e.status === 0) return e.message;
    if (e.status === 429) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
    if (/current password is incorrect/i.test(e.message)) return 'La contraseña actual no es correcta.';
    if (/must be different/i.test(e.message)) return 'La nueva contraseña debe ser distinta de la actual.';
    return 'No se pudo cambiar la contraseña. Revisa los datos ingresados.';
  }
}

/** Whether the session token already expired. */
export function sessionExpired(): boolean {
  const s = getSession();
  return !s || Date.now() >= s.expiresAt;
}

/**
 * Solo en desarrollo (`npm run dev`): inicia sesión sola con VITE_DEV_EMAIL / VITE_DEV_PASSWORD
 * (definidas en .env.local) cuando no hay sesión válida. En producción no hace nada.
 */
export async function devAutoLogin(): Promise<void> {
  const email = import.meta.env.VITE_DEV_EMAIL;
  const password = import.meta.env.VITE_DEV_PASSWORD;
  if (!import.meta.env.DEV || !email || !password) return;
  if (getSession() && !sessionExpired()) return;
  await login(String(email), String(password));
}
