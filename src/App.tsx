import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/shared/components/AppShell';
import { logout, sessionExpired } from '@/data/domain/auth';
import { bootData, domainsForPath, ensureLoaded } from '@/data/loadAll';
import { can } from '@/data/permissions';
import { useSession, wasSignedOut } from '@/data/session';
import { useDB } from '@/data/store';
import { FlowListPage } from '@/shared/components/flow-list/FlowListPage';
import { RecordsPage } from '@/shared/components/records/RecordsPage';
import { AuditoriaPage } from '@/features/administracion/submodules/auditoria/workspace';
import { ComprasPage } from '@/features/compras/workspace';
import { ConfiguracionPage } from '@/features/configuracion/workspace';
import { DashboardPage } from '@/features/dashboard/workspace';
import { DocumentosPage } from '@/features/documentos/workspace';
import { HistorialPage } from '@/features/historial/workspace';
import { KardexPage } from '@/features/inventario/submodules/kardex/workspace';
import { LoginPage } from '@/features/auth/workspace';
import { PermisosPage } from '@/features/administracion/submodules/permisos/workspace';
import { ReportesPage } from '@/features/reportes/workspace';
import { VentasPage } from '@/features/ventas/workspace';
import { RECORD_PAGES } from '@/shared/lib/configs';
import { ImportarDatosPage } from '@/features/mantenimiento/importar/workspace';
import { cotizaciones } from '@/shared/lib/configs/cotizaciones';
import { solicitudes } from '@/shared/lib/configs/solicitudes';
import { notifyRouteRendered } from '@/shared/lib/effects';
import { startRealtime, stopRealtime } from '@/shared/lib/realtime';
import { enabledModules, useModuleSwitches } from '@/modules/catalog';
import { MODULE_PAGES } from '@/modules/pages';
import { LocalCopySync } from '@/modules/LocalCopySync';

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
  { path: '/compras/solicitudes', module: 'Solicitudes', el: <FlowListPage key="sol" cfg={solicitudes} /> },
  { path: '/compras/ordenes', module: 'Órdenes de compra', el: <ComprasPage /> },
  { path: '/inventario/kardex', module: 'Kardex', el: <KardexPage /> },
  { path: '/historial', module: 'Historial', el: <HistorialPage /> },
  { path: '/documentos', module: 'Documentos', el: <DocumentosPage /> },
  { path: '/reportes', module: 'Reportes', el: <ReportesPage /> },
  { path: '/admin/permisos', module: 'Permisos', el: <PermisosPage /> },
  { path: '/admin/auditoria', module: 'Auditoría', el: <AuditoriaPage /> },
  { path: '/configuracion', module: 'Configuración', el: <ConfiguracionPage /> },
  // Importación general: cada hoja exige además permiso de crear y editar en su propia tabla.
  { path: '/mantenimiento/importar', module: 'Importar datos', el: <ImportarDatosPage /> },
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
  useModuleSwitches(); // las rutas de los módulos opcionales siguen a los interruptores, sin recargar
  const { hash, pathname } = useLocation();

  const token = session?.token;
  // La transición entre páginas espera a que la nueva ruta esté pintada.
  useLayoutEffect(() => {
    notifyRouteRendered();
  }, [pathname]);
  useEffect(() => {
    bootData(token, pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) ensureLoaded(domainsForPath(pathname));
  }, [token, pathname]);

  useEffect(() => {
    startRealtime(token);
    return stopRealtime;
  }, [token]);

  useEffect(() => {
    document.documentElement.dataset.density = String(d.settings.dens ?? 'Cómoda');
  }, [d.settings.dens]);

  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    else window.scrollTo(0, 0);
  }, [hash, pathname]);

  return (
    <>
    {/* Copia local de los datos para los módulos de Gestión (se actualiza sola con cada cambio del sistema). */}
    {token && <LocalCopySync key={token} />}
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {CUSTOM.map(r => <Route key={r.path} path={r.path} element={<Guard module={r.module}>{r.el}</Guard>} />)}
      {/* Módulos opcionales encendidos en Configuración › Módulos opcionales (apagados, su ruta cae en «*» y vuelve al inicio). */}
      {enabledModules().map(m => {
        const Page = MODULE_PAGES[m.id];
        return Page ? <Route key={m.path} path={m.path} element={<Guard module={m.viewPerm}><Page /></Guard>} /> : null;
      })}
      {Object.entries(RECORD_PAGES).map(([path, cfg]) => (
        <Route key={path} path={path} element={<Guard module={cfg.module ?? cfg.active}><RecordsPage key={path} cfg={cfg} /></Guard>} />
      ))}
      <Route path="/ventas/ordenes/nueva" element={<Navigate to="/ventas/ordenes?nueva=1" replace />} />
      <Route path="/compras/orden/:code" element={<OrdenCompraRedirect />} />
      <Route path="/compras/ordenes/nueva" element={<Navigate to="/compras/ordenes" replace />} />
      <Route path="/compras/recepcion" element={<Navigate to="/inventario/kardex" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}