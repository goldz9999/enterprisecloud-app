import { fmtDayTime } from '../../lib/dates';
import { setSession, getSession } from '../session';
import { currentUser, getDB, mutate, nextId } from '../store';
import { audit } from './audit';

/** Initial password for users without one of their own (sample users, invited users). */
export const INITIAL_PASSWORD = 'demo1234';

/** SHA-256 hex of the password. Falls back to a simple hash where WebCrypto is unavailable (plain-http LAN). */
export async function hashPassword(pw: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ec:' + pw));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const c of 'ec:' + pw) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return 'djb2:' + (h >>> 0).toString(16);
}

export type LoginResult = { ok: true; created?: boolean } | { ok: false; error: string; left?: number; locked?: boolean };

const maxAttempts = () => Number(getDB().settings.int) || 5;

/**
 * Signs in against the local Usuarios list.
 * With no users at all (fresh local data), the first sign-in creates an Administrador.
 */
export async function login(email: string, password: string, remember = true): Promise<LoginResult> {
  const hash = await hashPassword(password);
  const mail = email.trim().toLowerCase();
  const d = getDB();

  if (d.records.usuarios.length === 0) {
    mutate(dr => {
      const name = mail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      dr.records.usuarios.push({ _id: nextId(dr.records.usuarios), nombre: name, correo: mail, rol: 'Administrador', area: 'Gerencia', acceso: fmtDayTime(new Date()), mfa: 'Desactivado', estado: 'Activo', password: hash, intentos: 0 });
    });
    setSession({ email: mail, since: new Date().toISOString() }, remember);
    mutate(dr => audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: mail, desc: 'Primer ingreso · usuario Administrador creado' }));
    return { ok: true, created: true };
  }

  const user = d.records.usuarios.find(u => String(u.correo).toLowerCase() === mail);
  if (!user) {
    mutate(dr => audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: mail, desc: 'Inicio de sesión con correo no registrado', result: 'Fallido', user: mail, role: '—' }));
    return { ok: false, error: 'Correo o contraseña incorrectos.' };
  }
  if (user.estado === 'Bloqueado') {
    mutate(dr => audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: mail, desc: 'Intento de ingreso con cuenta bloqueada', result: 'Denegado', user: String(user.nombre), role: String(user.rol) }));
    return { ok: false, locked: true, error: 'Cuenta bloqueada. Pide al Administrador que la desbloquee en Administración › Usuarios.' };
  }
  if (user.estado === 'Inactivo') return { ok: false, error: 'Tu cuenta está inactiva. Contacta al Administrador.' };

  const valid = user.password ? user.password === hash : password === INITIAL_PASSWORD;
  if (!valid) {
    let left = 0;
    let locked = false;
    mutate(dr => {
      const u = dr.records.usuarios.find(x => x._id === user._id)!;
      u.intentos = Number(u.intentos ?? 0) + 1;
      left = maxAttempts() - Number(u.intentos);
      locked = left <= 0;
      if (locked) u.estado = 'Bloqueado';
      audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: mail, desc: 'Inicio de sesión', result: 'Fallido', user: String(u.nombre), role: String(u.rol), note: locked ? `${u.intentos} intentos fallidos. Cuenta bloqueada.` : `Contraseña incorrecta (intento ${u.intentos} de ${maxAttempts()}).` });
    });
    return locked
      ? { ok: false, locked: true, error: `Superaste ${maxAttempts()} intentos. La cuenta quedó bloqueada; el Administrador puede desbloquearla.` }
      : { ok: false, left, error: 'Correo o contraseña incorrectos.' };
  }

  mutate(dr => {
    const u = dr.records.usuarios.find(x => x._id === user._id)!;
    u.intentos = 0;
    u.acceso = fmtDayTime(new Date());
    if (u.estado === 'Sin confirmar') u.estado = 'Activo';
  });
  setSession({ email: String(user.correo), since: new Date().toISOString() }, remember);
  mutate(dr => audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: mail, desc: 'Inicio de sesión' }));
  return { ok: true };
}

/** `explicit`: the user chose to sign out (the next sign-in starts at the Dashboard). */
export function logout(explicit = false) {
  if (getSession()) mutate(dr => audit(dr, { action: 'Ingreso', module: 'Seguridad', ref: currentUser(dr).email, desc: explicit ? 'Cierre de sesión' : 'Sesión finalizada' }));
  setSession(null, true, explicit);
}

/** Changes the signed-in user's password. Returns an error message, or undefined on success. */
export async function changePassword(current: string, next: string): Promise<string | undefined> {
  const me = currentUser();
  if (!me.row) return 'Tu usuario no está en la lista de Usuarios.';
  const valid = me.password ? me.password === (await hashPassword(current)) : current === INITIAL_PASSWORD;
  if (!valid) return 'La contraseña actual no es correcta.';
  if (next.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
  const hash = await hashPassword(next);
  mutate(dr => {
    const u = dr.records.usuarios.find(x => x._id === me.row!._id);
    if (u) u.password = hash;
    audit(dr, { action: 'Editar', module: 'Seguridad', ref: me.email, desc: 'Cambio de contraseña' });
  });
}

/** Whether the session exceeded the configured duration ("8 horas"). */
export function sessionExpired(): boolean {
  const s = getSession();
  if (!s) return true;
  const hours = Number(/(\d+)/.exec(String(getDB().settings.ses ?? '8'))?.[1] ?? 8);
  return Date.now() - new Date(s.since).getTime() > hours * 3600000;
}
