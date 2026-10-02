# EnterpriseCloud — frontend

React + TypeScript (Vite) implementation of the EnterpriseCloud ERP designs (dark/light theme, Geist font).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

Data is in-memory sample data: changes are lost on reload. Login demo password: `demo1234`.

## Structure

| Path | What |
|---|---|
| `src/components/` | App shell (sidebar, topbar), drawer, modal, chips, KPI cards, toast, pagination |
| `src/features/records/` | Generic list screen (filters, table, KPIs, side drawer for CRUD or read-only + actions). Used by 18 screens |
| `src/pages/configs/` | One config per generic screen (columns, fields, statuses, actions, sample rows) |
| `src/features/flowlist/` | Cotizaciones / Solicitudes (list + detail panel + flow bar) |
| `src/features/order/` | Orden de venta / compra (5-step flow with forms) |
| `src/pages/` | Dashboard, Órdenes de venta, Documentos, Reportes, Permisos, Auditoría, Configuración, Login |
| `src/styles/` | Design tokens and shared styles |

To connect a backend, replace the sample `rows`/constants with API calls; the screens only read from those.
