import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/shared/components/AppShell';
import { Toast, useToast } from '@/shared/components/Toast';
import { loadAdmin, saveRolePermissions } from '@/data/domain/admin';
import { ACTIONS, can, MODULES } from '@/data/permissions';
import { useDB } from '@/data/store';
import type { PermMatrix } from '@/data/types';
import './workspace.css';

type Matrix = PermMatrix;
const clone = (m: Matrix): Matrix => JSON.parse(JSON.stringify(m));
const COLS = 'minmax(0, 1fr) repeat(5, 76px) 64px';

export function PermisosPage() {
  const d = useDB();
  const saved = d.permisos;
  const roles = d.records.roles.filter(r => r.estado !== 'Inactivo').map(r => [String(r.nombre), d.records.usuarios.filter(u => u.rol === r.nombre).length] as const);
  const [role, setRole] = useState(() => roles.find(([r]) => r === 'Ventas')?.[0] ?? roles[0]?.[0] ?? 'Administrador');
  const [perms, setPerms] = useState(() => clone(saved));
  const toast = useToast();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // La matriz vive en el backend: se carga al entrar y se vuelve a sincronizar si cambia lo guardado.
  const savedKey = JSON.stringify(saved);
  const roleKey = roles.map(([r]) => r).join('|');
  useEffect(() => { void loadAdmin({ permissions: true }); }, []);
  useEffect(() => { setPerms(clone(saved)); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (roles.length && !roles.some(([r]) => r === role)) setRole(roles[0][0]); }, [roleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const canEdit = can(d, 'Permisos', 'Editar');
  const locked = role === 'Administrador' || !canEdit;
  // Roles created after this screen opened get an empty row set.
  const rowOf = (m: string) => perms[role]?.[m] ?? saved[role]?.[m] ?? [false, false, false, false, false];

  const changed: [string, string, string][] = [];
  const changedRoles = new Set<string>();
  for (const r of Object.keys(perms))
    for (const m of Object.keys(perms[r]))
      perms[r][m].forEach((v, i) => {
        if (v !== (saved[r]?.[m]?.[i] ?? false)) changedRoles.add(r);
        if (v !== (saved[r]?.[m]?.[i] ?? false)) changed.push([`${r} · ${m} · ${ACTIONS[i]}`, v ? 'No' : 'Sí', v ? 'Sí' : 'No']);
      });
  const changes = changed.length;

  const update = (fn: (row: boolean[]) => void, mod: string) => {
    if (locked) return;
    setPerms(p => {
      const next = clone(p);
      next[role] ??= {};
      next[role][mod] ??= [false, false, false, false, false];
      fn(next[role][mod]);
      return next;
    });
  };

  // Any action implies "Ver"; removing "Ver" removes everything.
  const toggle = (mod: string, i: number) =>
    update(row => {
      row[i] = !row[i];
      if (i > 0 && row[i]) row[0] = true;
      if (i === 0 && !row[0]) row.fill(false);
    }, mod);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const res = await saveRolePermissions(perms, [...changedRoles]);
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.flash('Permisos guardados · registrado en auditoría');
  };

  return (
    <AppShell active="Permisos" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Permisos' }]}>
      <div>
        <h1 className="page__title">Permisos</h1>
        <div className="page__subtitle">Define qué puede hacer cada rol en cada módulo. Aplica a todos los usuarios con ese rol.</div>
      </div>

      <div className="toolbar">
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Rol</span>
        {roles.map(([r, n]) => (
          <button key={r} type="button" className={'filter-chip' + (role === r ? ' is-on' : '')} aria-pressed={role === r} onClick={() => setRole(r)}>
            {r}
            <span className="filter-chip__count">{n}</span>
          </button>
        ))}
        <Link to="/admin/roles" style={{ marginLeft: 'auto', fontSize: 12 }}>Gestionar roles →</Link>
      </div>

      {error && <div className="drawer-error">{error}</div>}
      {!canEdit && <div className="info-banner">Tu rol puede ver los permisos pero no modificarlos.</div>}
      {role === 'Administrador' && (
        <div className="info-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          El rol Administrador tiene acceso total y no se puede modificar.
        </div>
      )}

      <section className="panel">
        <div className="perm-row perm-row--head" style={{ gridTemplateColumns: COLS }}>
          <span>Módulo</span>
          {ACTIONS.map(a => <span key={a} className="t-center">{a}</span>)}
          <span className="t-center">Todo</span>
        </div>
        {MODULES.map(([group, mods]) => (
          <Fragment key={group}>
            <div className="perm-group">{group}</div>
            {mods.map(m => {
              const row = rowOf(m);
              const full = row.every(Boolean);
              return (
                <div key={m} className="perm-row perm-row--body" style={{ gridTemplateColumns: COLS }}>
                  <span style={{ paddingLeft: 8 }}>{m}</span>
                  {row.map((on, i) => {
                    const changed = on !== (saved[role]?.[m]?.[i] ?? false);
                    return (
                      <span key={i} className="t-center" style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          title={`${ACTIONS[i]} · ${m}`}
                          aria-label={`${ACTIONS[i]} · ${m}`}
                          disabled={locked}
                          className={'perm-box' + (on ? ' is-on' : '') + (changed ? ' is-changed' : '')}
                          onClick={() => toggle(m, i)}
                        >
                          {on ? '✓' : ''}
                        </button>
                      </span>
                    );
                  })}
                  <span style={{ display: 'flex', justifyContent: 'center' }}>
                    <button type="button" className="perm-all" onClick={() => update(r => r.fill(!full), m)}>{full ? 'Quitar' : 'Todo'}</button>
                  </span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </section>

      {changes > 0 && (
        <div className="savebar">
          <span className="savebar__dot" />
          <span style={{ flex: 1 }}>
            {changes} cambio{changes === 1 ? '' : 's'} sin guardar · se aplicará al siguiente inicio de sesión de los usuarios
          </span>
          <button type="button" className="btn" disabled={saving} onClick={() => { setPerms(clone(saved)); setError(''); }}>Descartar</button>
          <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}