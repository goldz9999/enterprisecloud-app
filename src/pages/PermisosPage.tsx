import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Toast, useToast } from '../components/Toast';
import './PermisosPage.css';

const ACTIONS = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar'];
const MODULES: [group: string, modules: string[]][] = [
  ['Inicio', ['Dashboard']],
  ['Ventas', ['Cotizaciones', 'Órdenes de venta', 'Comprobantes']],
  ['Compras', ['Solicitudes', 'Órdenes de compra', 'Recepción']],
  ['Inventario', ['Stock por almacén', 'Kardex', 'Transferencias', 'Ajustes']],
  ['Finanzas', ['Cuentas por cobrar', 'Cuentas por pagar', 'Caja', 'Bancos']],
  ['Documentos y reportes', ['Documentos', 'Reportes']],
  ['Mantenimiento', ['Clientes', 'Proveedores', 'Productos', 'Categorías', 'Almacenes']],
  ['Sistema', ['Usuarios', 'Roles', 'Permisos', 'Auditoría', 'Configuración']],
];
const ROLES: [role: string, users: number][] = [['Administrador', 1], ['Gerente', 1], ['Ventas', 2], ['Compras', 1], ['Almacén', 2], ['Contabilidad', 1]];

/** role → module → [ver, crear, editar, eliminar, aprobar] */
type Matrix = Record<string, Record<string, boolean[]>>;

const P = (...flags: number[]) => flags.map(Boolean);
const FULL = P(1, 1, 1, 1, 1), VIEW = P(1, 0, 0, 0, 0), WORK = P(1, 1, 1, 0, 0), NONE = P(0, 0, 0, 0, 0);

function defaults(): Matrix {
  const all: Matrix = {};
  const set = (role: string, fn: (group: string, mod: string) => boolean[]) => {
    all[role] = {};
    for (const [g, ms] of MODULES) for (const m of ms) all[role][m] = fn(g, m).slice();
  };
  const isIn = (m: string, list: string[]) => list.includes(m);
  set('Administrador', () => FULL);
  set('Gerente', (g, m) => (g === 'Sistema' ? (m === 'Configuración' ? NONE : VIEW) : FULL));
  set('Ventas', (g, m) => (g === 'Ventas' ? (m === 'Comprobantes' ? P(1, 1, 0, 0, 0) : WORK) : m === 'Clientes' ? WORK : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Documentos', 'Productos']) ? VIEW : NONE));
  set('Compras', (g, m) => (g === 'Compras' || m === 'Proveedores' ? WORK : isIn(m, ['Dashboard', 'Reportes', 'Stock por almacén', 'Kardex', 'Documentos', 'Productos', 'Cuentas por pagar']) ? VIEW : NONE));
  set('Almacén', (g, m) => (g === 'Inventario' || m === 'Recepción' ? WORK : m === 'Órdenes de venta' ? P(1, 0, 1, 0, 0) : m === 'Solicitudes' ? P(1, 1, 0, 0, 0) : isIn(m, ['Dashboard', 'Productos', 'Almacenes', 'Documentos']) ? VIEW : NONE));
  set('Contabilidad', (g, m) => (g === 'Finanzas' ? FULL : m === 'Comprobantes' ? P(1, 1, 1, 0, 1) : isIn(m, ['Dashboard', 'Reportes', 'Documentos', 'Clientes', 'Proveedores', 'Auditoría']) ? VIEW : NONE));
  return all;
}

const clone = (m: Matrix): Matrix => JSON.parse(JSON.stringify(m));
const COLS = 'minmax(0, 1fr) repeat(5, 76px) 64px';

export function PermisosPage() {
  const [role, setRole] = useState('Ventas');
  const [saved, setSaved] = useState(defaults);
  const [perms, setPerms] = useState(defaults);
  const toast = useToast();
  const locked = role === 'Administrador';

  let changes = 0;
  for (const r of Object.keys(perms)) for (const m of Object.keys(perms[r])) perms[r][m].forEach((v, i) => { if (v !== saved[r][m][i]) changes++; });

  const update = (fn: (row: boolean[]) => void, mod: string) => {
    if (locked) return;
    setPerms(p => {
      const next = clone(p);
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

  return (
    <AppShell active="Permisos" breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Permisos' }]}>
      <div>
        <h1 className="page__title">Permisos</h1>
        <div className="page__subtitle">Define qué puede hacer cada rol en cada módulo. Aplica a todos los usuarios con ese rol.</div>
      </div>

      <div className="toolbar">
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Rol</span>
        {ROLES.map(([r, n]) => (
          <button key={r} type="button" className={'filter-chip' + (role === r ? ' is-on' : '')} aria-pressed={role === r} onClick={() => setRole(r)}>
            {r}
            <span className="filter-chip__count">{n}</span>
          </button>
        ))}
        <Link to="/admin/roles" style={{ marginLeft: 'auto', fontSize: 12 }}>Gestionar roles →</Link>
      </div>

      {locked && (
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
              const row = perms[role][m];
              const full = row.every(Boolean);
              return (
                <div key={m} className="perm-row perm-row--body" style={{ gridTemplateColumns: COLS }}>
                  <span style={{ paddingLeft: 8 }}>{m}</span>
                  {row.map((on, i) => {
                    const changed = on !== saved[role][m][i];
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
          <button type="button" className="btn" onClick={() => setPerms(clone(saved))}>Descartar</button>
          <button type="button" className="btn btn--primary" style={{ padding: '0 16px' }} onClick={() => { setSaved(clone(perms)); toast.flash('Permisos guardados · registrado en auditoría'); }}>
            Guardar cambios
          </button>
        </div>
      )}
      <Toast message={toast.message} />
    </AppShell>
  );
}
