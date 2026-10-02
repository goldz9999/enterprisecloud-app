import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NAV, type NavItem } from './nav';
import './Sidebar.css';

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
  const navigate = useNavigate();
  const expanded = !collapsed;

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
        {NAV.map(e =>
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
              <div style={{ fontWeight: 500 }}>María Rojas</div>
              <div className="sb-menu__email">maria.rojas@empresa.pe</div>
            </div>
            <button type="button" role="menuitem" className="sb-menu__item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></svg>
              Mi perfil
            </button>
            <button type="button" role="menuitem" className="sb-menu__item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              Cambiar contraseña
            </button>
            <div className="sb-menu__sep" />
            <button type="button" role="menuitem" className="sb-menu__item sb-menu__item--danger" onClick={() => navigate('/login')}>
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
          <div className="sb-avatar">MR</div>
          {expanded && (
            <div className="sb-user__text">
              <div className="sb-user__name">María Rojas</div>
              <div className="sb-user__role">Gerente de Operaciones</div>
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
    </aside>
  );
}
