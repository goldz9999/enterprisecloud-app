import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useNow } from '../lib/useNow';
import { Sidebar } from './Sidebar';
import './AppShell.css';

export interface Crumb {
  label: string;
  to?: string;
}

interface AppShellProps {
  /** Sidebar label to highlight. */
  active: string;
  breadcrumb: Crumb[];
  /** Right-aligned topbar actions (e.g. the primary "Nuevo …" button). */
  actions?: ReactNode;
  children: ReactNode;
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
);

export function AppShell({ active, breadcrumb, actions, children }: AppShellProps) {
  const { theme, toggle } = useTheme();
  const now = useNow();
  const dateStr = now.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '');
  const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <div className="shell">
      <Sidebar active={active} />
      <div className="shell__col">
        <header className="topbar">
          <nav className="crumbs" aria-label="Ruta">
            {breadcrumb.map((c, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <Fragment key={c.label}>
                  {i > 0 && <Chevron />}
                  {last ? (
                    <span className="crumbs__current" aria-current="page">{c.label}</span>
                  ) : c.to ? (
                    <Link to={c.to} className="crumbs__link">{c.label}</Link>
                  ) : (
                    <span className="crumbs__link">{c.label}</span>
                  )}
                </Fragment>
              );
            })}
          </nav>

          <div className="topbar__search-wrap">
            <label className="search search--global">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input placeholder="Buscar en EnterpriseCloud…" aria-label="Búsqueda global" />
              <span className="kbd">⌘K</span>
            </label>
          </div>

          <div className="topbar__right">
            <div className="clock">
              <span>{dateStr}</span>
              <span className="clock__time">{timeStr}</span>
            </div>
            <div className="topbar__divider" />
            <button type="button" className="icon-btn" title="Cambiar a modo claro / oscuro" onClick={toggle}>
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
            <button type="button" className="icon-btn" title="Notificaciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
              <span className="notif-badge">6</span>
            </button>
            {actions}
          </div>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
