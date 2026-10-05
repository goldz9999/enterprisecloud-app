import { currentUser, nextCode } from '../store';
import type { AuditEvent, DB } from '../types';

function device(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'otro';
  return `${browser} · ${os}`;
}

type AuditInput = Pick<AuditEvent, 'action' | 'module' | 'ref' | 'desc'> & Partial<Pick<AuditEvent, 'result' | 'changes' | 'note' | 'user' | 'role'>>;

/** Appends an event to the audit log (newest first). Call inside update(). */
export function audit(d: DB, e: AuditInput) {
  const me = currentUser(d);
  d.audit.unshift({
    id: nextCode(d, 'AUD-', 6),
    at: new Date().toISOString(),
    user: e.user ?? me.name,
    role: e.role ?? me.role,
    action: e.action,
    module: e.module,
    ref: e.ref,
    desc: e.desc,
    result: e.result ?? 'Exitoso',
    changes: e.changes ?? [],
    note: e.note ?? '',
    ip: 'local',
    device: device(),
  });
}

/** Field-level differences between two versions of a record, for the audit trail. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string> = {}): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const k of Object.keys(after)) {
    if (k.startsWith('_') || k === 'password' || k === 'reset' || k === 'intentos') continue;
    const a = before[k] ?? '';
    const b = after[k] ?? '';
    if (String(a) !== String(b)) out.push([labels[k] ?? k, String(a) || '—', String(b) || '—']);
  }
  return out;
}
