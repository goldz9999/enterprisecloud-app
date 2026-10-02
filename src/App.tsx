import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ROUTES } from './components/nav';
import { ClientesPage } from './features/clientes/ClientesPage';

/** Screens that exist in the design bundle but are not implemented yet. */
function PendingPage({ label }: { label: string }) {
  return (
    <AppShell active={label} breadcrumb={[{ label: 'Inicio', to: '/' }, { label }]}>
      <h1 className="page__title">{label}</h1>
      <div className="page__subtitle">Pantalla pendiente de implementar.</div>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/mantenimiento/clientes" element={<ClientesPage />} />
      {ROUTES.filter(r => r.to !== '/mantenimiento/clientes').map(r => (
        <Route key={r.to} path={r.to} element={<PendingPage label={r.label} />} />
      ))}
      <Route path="/login" element={<div className="page"><h1 className="page__title">Login</h1><div className="page__subtitle">Pantalla pendiente de implementar.</div></div>} />
      <Route path="*" element={<Navigate to="/mantenimiento/clientes" replace />} />
    </Routes>
  );
}
