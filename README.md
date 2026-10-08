# EnterpriseCloud — frontend

React + TypeScript (Vite) implementation of the EnterpriseCloud ERP designs (dark/light theme, Geist font).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

## Backend

La app necesita el backend FastAPI (`El-Real-Backend`) en ejecución. La URL se configura con `VITE_API_URL` (por defecto `http://localhost:8000/api/v1`). Inicia sesión con una cuenta del backend: el acceso, los roles y los permisos los gestiona él.

- Al iniciar sesión se descargan del backend los maestros, la administración, las órdenes de venta y compra, cotizaciones, solicitudes, comprobantes, inventario y finanzas (la lista exacta está en `src/data/loadAll.ts`).
- Las lecturas se reintentan ante fallos transitorios; si siguen fallando se muestra un aviso con **Reintentar** en lugar de dejar la pantalla vacía.
- El navegador conserva una copia local en `localStorage` (`ec-db-v1`) y los archivos subidos en IndexedDB; es solo un espejo para pintar las pantallas.
- Abre la app desde `localhost` (no `127.0.0.1`), salvo que el backend permita ese origen en su configuración CORS.

Los flujos de venta (cotización → orden → despacho → comprobante → cobro) y de compra (solicitud → OC → recepción → factura → pago) se ejecutan en el backend. Sin integración real con correo, SUNAT ni SSO.

## Structure

| Path | What |
|---|---|
| `src/data/` | Store (`store.ts`), sesión, seed demo/vacío, permisos, configuración, archivos (IndexedDB) |
| `src/data/domain/` | Lógica de negocio: órdenes, flujos, stock, finanzas, documentos, métricas, auditoría, auth |
| `src/components/` | App shell (sidebar, topbar, búsqueda global, notificaciones, diálogo de datos), drawer, modal, etc. |
| `src/features/records/` | Pantalla genérica de listado + CRUD configurable |
| `src/pages/configs/` | Una config por pantalla genérica |
| `src/features/flowlist/` | Cotizaciones / Solicitudes |
| `src/features/order/` | Orden de venta / compra (flujo de 5 pasos) y nueva orden |
| `src/pages/` | Dashboard, Ventas, Documentos, Reportes, Permisos, Auditoría, Configuración, Login |
| `src/styles/` | Design tokens y estilos compartidos |

Para conectar un backend, reemplaza `src/data/store.ts` por llamadas a la API; las pantallas solo leen/escriben a través del store y `src/data/domain/`.
