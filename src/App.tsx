import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

function SolicitudesRedirect() {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  const sku = p.get('nuevo');
  return <Navigate to={sku ? `/compras/ordenes?nuevo=${encodeURIComponent(sku)}${p.get('alm') ? `&alm=${encodeURIComponent(p.get('alm')!)}` : ''}` : '/compras/ordenes'} replace />;
}
import { AppShell } from './components/AppShell';
import { logout, sessionExpired } from './data/domain/auth';
import { bootData, domainsForPath, ensureLoaded } from './data/loadAll';
import { can } from './data/permissions';
import { useSession, wasSignedOut } from './data/session';
import { useDB } from './data/store';
import { FlowListPage } from './features/flowlist/FlowListPage';
import { RecordsPage } from './features/records/RecordsPage';
import { AuditoriaPage } from './pages/AuditoriaPage';
import { ComprasPage } from './pages/ComprasPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { HistorialPage } from './pages/HistorialPage';
import { KardexPage } from './pages/KardexPage';
import { LoginPage } from './pages/LoginPage';
import { PermisosPage } from './pages/PermisosPage';
import { ReportesPage } from './pages/ReportesPage';
import { VentasPage } from './pages/VentasPage';
import { RECORD_PAGES } from './pages/configs';
import { cotizaciones } from './pages/configs/cotizaciones';
import { startRealtime, stopRealtime } from './lib/realtime';

/** Las órdenes de venta tampoco tienen página propia: se ven y aprueban en un modal de la lista (?ver=). */
function OrdenVentaRedirect() {
  const { code = '' } = useParams();
  return <Navigate to={`/ventas/ordenes?ver=${encodeURIComponent(code)}`} replace />;
}

/** Las órdenes de compra ya no tienen página propia: se ven en un modal de la lista (?ver=). */
function OrdenCompraRedirect() {
  const { code = '' } = useParams();
  return <Navigate to={`/compras/ordenes?ver=${encodeURIComponent(code)}`} replace />;
}

/** Screens with their own layout, and the permission module each one belongs to. */
const CUSTOM: { path: string; module: string; el: ReactNode }[] = [
  { path: '/', module: 'Dashboard', el: <DashboardPage /> },
  { path: '/ventas/cotizaciones', module: 'Cotizaciones', el: <FlowListPage key="cot" cfg={cotizaciones} /> },
  { path: '/ventas/ordenes', module: 'Órdenes de venta', el: <VentasPage /> },
  { path: '/ventas/orden/:code', module: 'Órdenes de venta', el: <OrdenVentaRedirect /> },
  { path: '/compras/ordenes', module: 'Órdenes de compra', el: <ComprasPage /> },
  { path: '/inventario/kardex', module: 'Kardex', el: <KardexPage /> },
  { path: '/historial', module: 'Historial', el: <HistorialPage /> },
  { path: '/documentos', module: 'Documentos', el: <DocumentosPage /> },
  { path: '/reportes', module: 'Reportes', el: <ReportesPage /> },
  { path: '/admin/permisos', module: 'Permisos', el: <PermisosPage /> },
  { path: '/admin/auditoria', module: 'Auditoría', el: <AuditoriaPage /> },
  { path: '/configuracion', module: 'Configuración', el: <ConfiguracionPage /> },
];

function SignOut() {
  useEffect(() => logout(), []);
  return null;
}

/** Requires a valid session, and the "Ver" permission on the screen's module. */
function Guard({ module, children }: { module: string; children: ReactNode }) {
  const session = useSession();
  const d = useDB();
  const loc = useLocation();
  const login = <Navigate to={wasSignedOut() ? '/login' : `/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!session) return login;
  // The token expired: revoke it and go back to the login.
  if (sessionExpired())
    return (
      <>
        <SignOut />
        {login}
      </>
    );
  if (!can(d, module, 'Ver'))
    return (
      <AppShell active={module} breadcrumb={[{ label: 'Inicio', to: '/' }, { label: module }]}>
        <h1 className="page__title">Sin acceso</h1>
        <div className="page__subtitle">
          Tu rol ({session.user.role.name}) no tiene permiso para ver {module}. Pide acceso al Administrador o <Link to="/">vuelve al inicio</Link>.
        </div>
      </AppShell>
    );
  return <>{children}</>;
}

export function App() {
  const d = useDB();
  const session = useSession();
  const { hash, pathname } = useLocation();

  // On load (and after each sign-in) confirm the token with the backend and pick up role/permission changes.
  const token = session?.token;
  useEffect(() => {
    bootData(token, pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Cada pantalla pide solo los datos de su módulo (lo ya cargado no se vuelve a pedir).
  useEffect(() => {
    if (token) ensureLoaded(domainsForPath(pathname));
  }, [token, pathname]);

  // Actualización automática: el backend avisa por WebSocket cuando otra persona guarda algo.
  useEffect(() => {
    startRealtime(token);
    return stopRealtime;
  }, [token]);

  // Table density preference from Configuración › Apariencia.
  useEffect(() => {
    document.documentElement.dataset.density = String(d.settings.dens ?? 'Cómoda');
  }, [d.settings.dens]);

  // Scroll to #anchors (e.g. /configuracion#datos), otherwise to the top on navigation.
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    else window.scrollTo(0, 0);
  }, [hash, pathname]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {CUSTOM.map(r => <Route key={r.path} path={r.path} element={<Guard module={r.module}>{r.el}</Guard>} />)}
      {Object.entries(RECORD_PAGES).map(([path, cfg]) => (
        // key per path so state resets when moving between list screens
        <Route key={path} path={path} element={<Guard module={cfg.module ?? cfg.active}><RecordsPage key={path} cfg={cfg} /></Guard>} />
      ))}
      {/* Rutas anteriores: crear órdenes ahora es un modal dentro de cada lista; la recepción vive en Kardex. */}
      <Route path="/ventas/ordenes/nueva" element={<Navigate to="/ventas/ordenes?nueva=1" replace />} />
      <Route path="/compras/orden/:code" element={<OrdenCompraRedirect />} />
      {/* Solicitudes de compra se retiraron: los enlaces antiguos van a Órdenes de compra (con ?nuevo=SKU&alm=… abre la nueva orden). */}
      <Route path="/compras/solicitudes" element={<SolicitudesRedirect />} />
      <Route path="/compras/ordenes/nueva" element={<Navigate to="/compras/ordenes" replace />} />
      <Route path="/compras/recepcion" element={<Navigate to="/inventario/kardex" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}