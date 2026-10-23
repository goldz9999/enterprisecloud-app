import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { changePassword, logout } from '@/data/domain/auth';
import { can } from '@/data/permissions';
import { useSession } from '@/data/session';
import { fmtDayTime } from '@/shared/lib/dates';
import { currentUser, mutate, useDB } from '@/data/store';
import { audit } from '@/data/domain/audit';
import { isLoaded } from '@/data/loadAll';
import { Modal } from './Modal';
import { buildNav, type NavEntry, type NavItem } from './nav';
import { useModuleSwitches } from '@/modules/catalog';

interface SidebarProps {
  /** Label of the active screen (top-level item or child). */
  active: string;
  startCollapsed?: boolean;
}

export function Sidebar({ active, startCollapsed = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  // Explicit open/closed per group; groups without an entry fall back to "open if it holds the active screen".
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);
  const d = useDB();
  useModuleSwitches(); // al encender/apagar un módulo opcional, el menú se actualiza solo
  useSession(); // permissions can change after /auth/me
  const me = currentUser(d);
  const initials = me.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const [dialog, setDialog] = useState<'perfil' | 'clave' | null>(null);
  const expanded = !collapsed;

  // Live counters next to menu entries.
  // Solo hay contador de los módulos cuyos datos ya se cargaron en esta sesión (se cargan al entrar a su pantalla).
  const counts: Record<string, number> = {
    Cotizaciones: isLoaded('quotations') ? d.cotizaciones.filter(c => c.status === 'Enviada' || c.status === 'Borrador').length : 0,
    'Órdenes de venta': isLoaded('sales') ? d.orders.filter(o => o.kind === 'venta' && !o.cancelled && o.done < 5).length : 0,
    Solicitudes: isLoaded('requests') ? d.solicitudes.filter(s => s.status === 'Pendiente').length : 0,
    'Órdenes de compra': isLoaded('purchases') ? d.orders.filter(o => o.kind === 'compra' && !o.cancelled && o.done < 5).length : 0,
    'Stock por almacén': isLoaded('stock') ? d.records.stock.filter(s => s.estado === 'Bajo mínimo' || s.estado === 'Sin stock').length : 0,
    // Órdenes de compra pendientes de recepción.
    Kardex: isLoaded('purchases') ? d.orders.filter(o => o.kind === 'compra' && !o.cancelled && o.done === 2).length : 0,
  };
  const badge = (label: string) => (counts[label] ? String(counts[label]) : undefined);

  // Only modules the user's role can see; groups disappear when all their screens are hidden.
  const visible: NavEntry[] = [];
  for (const e of buildNav()) {
    if (e.kind === 'section') visible.push(e);
    else if (e.children) {
      const kids = e.children.filter(c => can(d, c.label, 'Ver')).map(c => ({ ...c, badge: badge(c.label) }));
      if (kids.length) visible.push({ ...e, children: kids, dot: e.label === 'Inventario' && !!counts['Stock por almacén'] });
    } else if (can(d, e.label, 'Ver')) visible.push(e);
  }
  const nav = visible.filter((e, i) => e.kind !== 'section' || (visible[i + 1] && visible[i + 1].kind !== 'section'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      const target = e.target as HTMLElement;
      if (e.key === '[' && !/INPUT|TEXTAREA|SELECT/.test(target.tagName)) setCollapsed(c => !c);
    };
    const onDown = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const renderItem = (g: NavItem) => {
    const kids = g.children ?? [];
    const holdsActive = kids.some(c => c.label === active);
    const isActive = g.label === active;
    const isOpen = openGroups[g.label] ?? holdsActive;
    const showKids = expanded && kids.length > 0 && isOpen;
    const cls = ['sb-item', isActive && 'is-active', (isActive || holdsActive) && 'is-current'].filter(Boolean).join(' ');

    const content = (
      <>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="sb-item__icon">
          <path d={g.icon} />
        </svg>
        {expanded && (
          <>
            <span className="sb-item__label">{g.label}</span>
            {g.badge && <span className="sb-badge">{g.badge}</span>}
            {g.dot && <span className="sb-dot" />}
            {kids.length > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" className="sb-chevron" style={{ transform: `rotate(${isOpen ? 90 : 0}deg)` }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </>
        )}
      </>
    );

    return (
      <div key={g.label} className="sb-group">
        {kids.length > 0 ? (
          <button
            type="button"
            className={cls}
            title={g.label}
            aria-expanded={showKids}
            onClick={() => {
              // In collapsed mode, clicking a group expands the sidebar and opens it.
              setCollapsed(false);
              setOpenGroups(s => ({ ...s, [g.label]: !(expanded && isOpen) }));
            }}
          >
            {content}
          </button>
        ) : (
          <Link to={g.to ?? '/'} className={cls} title={g.label} aria-current={isActive ? 'page' : undefined}>
            {content}
          </Link>
        )}
        {showKids && (
          <div className="sb-children">
            {kids.map(c => (
              <Link
                key={c.label}
                to={c.to}
                title={c.label}
                className={'sb-child' + (c.label === active ? ' is-active' : '')}
                aria-current={c.label === active ? 'page' : undefined}
              >
                <span className="sb-item__label">{c.label}</span>
                {c.badge && <span className="sb-badge">{c.badge}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar" style={{ width: expanded ? 232 : 56 }}>
      <div className="sb-brand">
        <div className="sb-logo">E</div>
        {expanded && <div className="sb-brand__name">EnterpriseCloud</div>}
      </div>

      <nav className="sb-nav">
        {nav.map(e =>
          e.kind === 'section' ? (
            expanded ? (
              <div key={'s-' + e.label} className="sb-section">{e.label}</div>
            ) : (
              <div key={'s-' + e.label} className="sb-sep" />
            )
          ) : (
            renderItem(e)
          ),
        )}
      </nav>

      <div ref={footRef} className="sb-foot">
        {menuOpen && (
          <div role="menu" className="sb-menu">
            <div className="sb-menu__head">
              <div style={{ fontWeight: 500 }}>{me.name}</div>
              <div className="sb-menu__email">{me.email}</div>
            </div>
            <button type="button" role="menuitem" className="sb-menu__item" onClick={() => { setMenuOpen(false); setDialog('perfil'); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></svg>
              Mi perfil
            </button>
            <button type="button" role="menuitem" className="sb-menu__item" onClick={() => { setMenuOpen(false); setDialog('clave'); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              Cambiar contraseña
            </button>
            <div className="sb-menu__sep" />
            <button type="button" role="menuitem" className="sb-menu__item sb-menu__item--danger" onClick={() => logout(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              Cerrar sesión
            </button>
          </div>
        )}

        <button
          type="button"
          className={'sb-user' + (menuOpen ? ' is-open' : '')}
          title="Cuenta"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(m => !m)}
        >
          <div className="sb-avatar">{initials || '?'}</div>
          {expanded && (
            <div className="sb-user__text">
              <div className="sb-user__name">{me.name}</div>
              <div className="sb-user__role">{me.role}{me.area ? ' · ' + me.area : ''}</div>
            </div>
          )}
        </button>

        <button type="button" className="sb-collapse" title="Colapsar sidebar  [" onClick={() => setCollapsed(c => !c)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
          </svg>
          {expanded && (
            <>
              <span>Colapsar</span>
              <span className="kbd" style={{ marginLeft: 'auto', padding: '1px 4px' }}>[</span>
            </>
          )}
        </button>
      </div>
      {dialog === 'perfil' && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog === 'clave' && <PasswordDialog onClose={() => setDialog(null)} />}
    </aside>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const d = useDB();
  const me = currentUser(d);
  const [name, setName] = useState(me.name);
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      title="Mi perfil"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cerrar</button>
          {me.row && (
            <button
              type="button"
              className="btn btn--primary"
              style={{ height: 30, padding: '0 14px' }}
              disabled={!name.trim() || name === me.name}
              onClick={() => {
                mutate(dr => {
                  const u = dr.records.usuarios.find(x => x._id === me.row!._id);
                  if (u) u.nombre = name.trim();
                  audit(dr, { action: 'Editar', module: 'Administración', ref: me.email, desc: 'Perfil actualizado', changes: [['Nombre', me.name, name.trim()]] });
                });
                setSaved(true);
              }}
            >
              Guardar
            </button>
          )}
        </>
      }
    >
      <label className="field">
        <span className="field__label">Nombres y apellidos</span>
        <input className="field__control" style={{ padding: '0 10px' }} value={name} onChange={e => { setName(e.target.value); setSaved(false); }} disabled={!me.row} />
      </label>
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
        <span>Correo</span><span>{me.email}</span>
        <span>Rol</span><span>{me.role}</span>
        <span>Área</span><span>{me.area || '—'}</span>
        <span>Último acceso</span><span>{me.lastLogin ? fmtDayTime(new Date(me.lastLogin)) : String(me.row?.acceso ?? '—')}</span>
      </div>
      {saved && <div className="success" style={{ fontSize: 12, padding: '8px 12px' }}>Perfil actualizado.</div>}
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>El rol y el área los cambia el Administrador en Administración › Usuarios.</div>
    </Modal>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (next !== rep) return setError('Las contraseñas nuevas no coinciden.');
    const err = await changePassword(cur, next);
    if (err) return setError(err);
    setError('');
    setDone(true);
  };
  return (
    <Modal
      title="Cambiar contraseña"
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn btn--primary" style={{ height: 30, padding: '0 14px' }} onClick={onClose}>Listo</button>
        ) : (
          <>
            <button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn--primary" style={{ height: 30, padding: '0 14px' }} onClick={submit}>Cambiar contraseña</button>
          </>
        )
      }
    >
      {done ? (
        <div>Tu contraseña se actualizó. Úsala la próxima vez que inicies sesión.</div>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Contraseña actual</span>
            <input className="field__control" style={{ padding: '0 10px' }} type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span className="field__label">Nueva contraseña (mín. 8 caracteres)</span>
            <input className="field__control" style={{ padding: '0 10px' }} type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">
            <span className="field__label">Repite la nueva contraseña</span>
            <input className="field__control" style={{ padding: '0 10px' }} type="password" value={rep} onChange={e => setRep(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <div className="drawer-error">{error}</div>}
        </>
      )}
    </Modal>
  );
}