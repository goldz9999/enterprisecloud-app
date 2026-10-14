import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { loadAll } from '../data/loadAll';
import { clearLoadFailures, useLoadFailures } from '../lib/loadStatus';
import { useTheme } from '../lib/theme';
import { useNow } from '../lib/useNow';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsMenu } from './NotificationsMenu';
import { Sidebar } from './Sidebar';
import { Toast, useToast } from './Toast';
import './AppShell.css';

export interface Crumb {
  label: string;
  to?: string;
  /** Render as a document code (monospace). */
  mono?: boolean;
}

interface AppShellProps {
  /** Sidebar label to highlight. */
  active: string;
  breadcrumb: Crumb[];
  /** Right-aligned topbar actions (e.g. the primary "Nuevo …" button). */
  actions?: ReactNode;
  searchPlaceholder?: string;
  /** Narrower content column for form-style pages. */
  narrow?: boolean;
  children: ReactNode;
}

/** Plataforma CloudOps (mide la seguridad de este ERP). Configurable con VITE_CLOUDOPS_URL. */
const CLOUDOPS_URL = String(import.meta.env.VITE_CLOUDOPS_URL ?? 'https://cloudops-dashboard-ochre.vercel.app').replace(/\/+$/, '');

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
);

export function AppShell({ active, breadcrumb, actions, searchPlaceholder = 'Buscar en EnterpriseCloud…', narrow, children }: AppShellProps) {
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const loadFailures = useLoadFailures();
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
                    <span className={'crumbs__current' + (c.mono ? ' mono' : '')} style={c.mono ? { fontSize: 12 } : undefined} aria-current="page">{c.label}</span>
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
            <GlobalSearch placeholder={searchPlaceholder} />
          </div>

          <div className="topbar__right">
            <div className="clock">
              <span>{dateStr}</span>
              <span className="clock__time">{timeStr}</span>
            </div>
            <div className="topbar__divider" />
            <a
              className="btn"
              href={CLOUDOPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir CloudOps en una pestaña nueva: mide la seguridad de este sistema"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>
              CloudOps
            </a>
            <button type="button" className="icon-btn" title="Cambiar a modo claro / oscuro" onClick={toggle}>
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
            <NotificationsMenu />
            {actions}
          </div>
        </header>

        <main className="page" style={narrow ? { maxWidth: 1100 } : undefined}>
          {loadFailures > 0 && (
            <div className="note" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>No se pudieron cargar algunos datos del servidor, así que esta pantalla puede estar incompleta.</span>
              <button type="button" className="btn" onClick={() => { clearLoadFailures(); loadAll(); }}>Reintentar</button>
            </div>
          )}
          {children}
        </main>
        <Toast message={toast.message} />
      </div>
    </div>
  );
}
