# EnterpriseCloud — frontend

React + TypeScript (Vite) implementation of the EnterpriseCloud ERP designs (dark/light theme, Geist font).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

## Datos locales

Todo funciona en el navegador, sin backend:

- Registros, órdenes, permisos, auditoría y configuración se guardan en `localStorage` (`ec-db-v1`); los archivos subidos en IndexedDB.
- Arranca con **datos de ejemplo** (los mocks del diseño). Inicia sesión con cualquier usuario de ejemplo y la contraseña `demo1234` (p. ej. `maria.rojas@empresa.pe`, Gerente).
- El chip **"Datos de ejemplo"** de la barra superior (o Configuración › Datos) abre el diálogo de datos:
  - **Quitar datos de ejemplo**: borra todos los mocks y deja la app vacía para uso real. Conserva configuración, roles y permisos, y tu usuario (como Administrador, misma contraseña).
  - **Exportar / importar copia** (JSON) y **restaurar ejemplo**.
- Si no hay usuarios, el primer inicio de sesión crea el Administrador.

Los flujos tienen efectos reales: venta (cotización → orden → stock → despacho → comprobante → cobro) y compra (solicitud → OC → recepción → factura → pago) actualizan stock, kardex, costo promedio, CxC/CxP, bancos/caja y documentos. Dashboard y reportes se calculan con los datos.

Sin integración real con correo, SUNAT ni SSO; la programación de reportes solo se registra.

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
