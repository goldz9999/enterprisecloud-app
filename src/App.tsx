import type { JSX } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FlowListPage } from './features/flowlist/FlowListPage';
import { OrderPage } from './features/order/OrderPage';
import { RecordsPage } from './features/records/RecordsPage';
import { AuditoriaPage } from './pages/AuditoriaPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { LoginPage } from './pages/LoginPage';
import { PermisosPage } from './pages/PermisosPage';
import { ReportesPage } from './pages/ReportesPage';
import { VentasPage } from './pages/VentasPage';
import { RECORD_PAGES } from './pages/configs';
import { cotizaciones } from './pages/configs/cotizaciones';
import { ordenCompra } from './pages/configs/ordenCompra';
import { ordenVenta } from './pages/configs/ordenVenta';
import { solicitudes } from './pages/configs/solicitudes';

/** Remounts the order when ?paso= changes so the flow starts at the requested step. */
function OrderRoute({ cfg }: { cfg: typeof ordenVenta }) {
  const { search } = useLocation();
  return <OrderPage key={cfg.code + search} cfg={cfg} />;
}

/** Screens with their own layout (everything else is a RecordsPage config). */
const CUSTOM: Record<string, JSX.Element> = {
  '/': <DashboardPage />,
  '/ventas/cotizaciones': <FlowListPage key="cot" cfg={cotizaciones} />,
  '/ventas/ordenes': <VentasPage />,
  '/ventas/orden': <OrderRoute cfg={ordenVenta} />,
  '/compras/solicitudes': <FlowListPage key="sol" cfg={solicitudes} />,
  '/compras/orden': <OrderRoute cfg={ordenCompra} />,
  '/documentos': <DocumentosPage />,
  '/reportes': <ReportesPage />,
  '/admin/permisos': <PermisosPage />,
  '/admin/auditoria': <AuditoriaPage />,
  '/configuracion': <ConfiguracionPage />,
  '/login': <LoginPage />,
};

export function App() {
  return (
    <Routes>
      {Object.entries(CUSTOM).map(([path, el]) => <Route key={path} path={path} element={el} />)}
      {Object.entries(RECORD_PAGES).map(([path, cfg]) => (
        // key per path so state resets when moving between list screens
        <Route key={path} path={path} element={<RecordsPage key={path} cfg={cfg} />} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
