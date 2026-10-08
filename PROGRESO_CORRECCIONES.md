# Progreso de correcciones — EnterpriseCloud

**Fecha:** 2026-10-08  
**Referencia:** `INFORME_PRUEBAS_SISTEMA.md` (numeración de bugs: 2.1, 2.2, …)  
**Estado de git:** hay cambios **sin commit** en los dos repos (`enterprisecloud-app` y `El-Real-Backend`). No hice ningún commit.

---

## 1. Resumen

| | Antes | Ahora |
|---|---|---|
| Flujo de venta completo desde la interfaz | Bloqueado en el primer paso | **Funciona** (OV-2026-0003: crear → confirmar → despachar → facturar → cobrar) |
| Flujo de compra completo desde la interfaz | Bloqueado en el primer paso | **Funciona** (OC-2026-0003: crear → aprobar → recibir → facturar → pagar) |
| Carga en frío de la app (36 peticiones simultáneas) | 14–36 respuestas 500 por ráfaga | **0 fallos en 6 ráfagas de 36** (3 en cada una de las 2 instancias) y 0 errores en las cargas del navegador posteriores |
| Recargar una orden con F5 | Pantalla en blanco | La orden se pinta con el estado real |

Se corrigieron **3 causas raíz** (una en cada capa) y se descubrieron **5 problemas nuevos** (sección 4).

---

## 2. Qué se cambió

### 2.1 Backend — búsqueda por código de documento (bug 2.1) ✅

**Problema:** cada servicio comparaba el código (`OV-2026-0001`) con la columna `uuid` `id` antes de buscar por `code`, y Postgres fallaba con `22P02` → `400 "Invalid value in request"`.

**Solución:** nuevo helper `find_by_id_or_code(table, value, select="*", **filters)` en `app/repositories/client.py`. Elige la columna por el formato del valor (UUID → `id`, cualquier otro → `code`). Sustituye los **17 sitios**:

| Archivo | Sitios |
|---|---|
| `app/services/orders.py` | 3 (ver, completar paso, anular) |
| `app/services/purchase_orders.py` | 3 |
| `app/services/purchase_requests.py` | 4 |
| `app/services/quotations.py` | 3 |
| `app/services/inventory.py` | 3 (despachar, recibir, cancelar transferencia) |

Un `grep` posterior no encuentra más `.eq("code", …)` ni `.eq("id", <código>)` en `app/`.

### 2.2 Backend — respuestas 500 bajo concurrencia (causa real del bug 2.8) ✅

**Problema:** `postgrest` crea su cliente HTTP con `http2=True`, es decir, **una sola conexión multiplexada compartida por todos los hilos** de FastAPI. Con ~36 peticiones simultáneas, `httpcore` fallaba con `httpx.ReadError: [WinError 10035]` y la API respondía **500**. Los 500 salen del middleware más externo, sin cabeceras CORS, y el navegador los mostraba como `blocked by CORS policy` / `ERR_FAILED`.

**Corrige mi diagnóstico anterior.** El informe decía que el límite de 120 peticiones por minuto "no estaba confirmado como causa". Ahora está claro que la causa de los fallos intermitentes de carga era esta, no el límite de tasa.

**Solución:** `use_http1(pg)` en `app/repositories/client.py` sustituye solo la sesión de PostgREST por un `httpx.Client(http2=False)` con pool de conexiones, y se aplica en `_build()`. Storage y Auth no se tocan.

**Evidencia (ráfaga de 36 peticiones, tres veces seguidas, con y sin inactividad):**

| | Respuestas 200 |
|---|---|
| Antes, backend real (puerto 8000) | 22/36 · 0/36 · 8/36 (28 `ECONNRESET`) |
| Antes, instancia de prueba (puerto 8001) | 17/36 · 17/36 · 36/36 |
| Después (instancia de prueba, puerto 8001) | 36/36 · 36/36 · 36/36 |
| Después (backend real, puerto 8000) | 36/36 · 36/36 · 36/36 |

### 2.3 Frontend — pantalla en blanco al recargar una orden ✅ (nuevo)

**Problema:** `src/features/order/OrderPage.tsx` tenía dos `useCallback` **después** del `return` de "Orden no encontrada". Al recargar, la orden aún no estaba en el primer render (menos hooks) y al llegar los datos había más, así que React lanzaba *"change in the order of Hooks"* y toda la pantalla quedaba en blanco.

**Solución:** `handleFiles` y `handleDrop` pasan a funciones normales (no necesitan memoización) y se quitó el import de `useCallback`. Mínimo cambio, sin tocar el comportamiento.

---

## 3. Estado de los bugs del informe

| # | Bug | Estado | Nota |
|---|---|---|---|
| 2.1 | Operaciones por código devuelven 400 | ✅ Corregido | Verificado en API y en interfaz |
| 2.2 | Costo promedio nunca se calcula | ✅ Corregido (ronda 3) | Cada recepción actualiza `products.average_cost` (promedio ponderado); las salidas se valorizan a ese costo. Ver sección 10 |
| 2.3 | La reserva de stock no existe | ✅ Corregido (ronda 2) | `reservado` = líneas de ventas confirmadas sin despachar; `disponible` = stock − reservado |
| 2.4 | Anular una orden ya facturada no revierte nada | ✅ Corregido (ronda 2) | Venta: solo se puede anular antes del despacho. Compra: antes de la recepción. Después responde 400 con el motivo (la reversión no existe, así que se bloquea) |
| 2.5 | Convertir solicitud → 500 | ✅ Resuelto en la práctica | Con el código nuevo devuelve 200 y la solicitud queda "Atendida". Probablemente era la falla HTTP/2, pero **no lo puedo demostrar** |
| 2.6 | "Elige un cliente." con un cliente visible | ✅ Corregido (ronda 2) | Los valores efectivos se derivan en cada render. Verificado: recarga en frío y crear la venta sin tocar los desplegables |
| 2.7 | Un fallo de carga se muestra como "no hay datos" | ✅ Corregido (ronda 2) | Las lecturas se reintentan y, si siguen fallando, aparece un aviso con **Reintentar**. Las pantallas vacías debajo del aviso siguen diciendo "Aún no hay registros" |
| 2.8 | Carga inicial pesada e intermitente | ✅ Causa corregida · ⚠️ parcial | Inventario y finanzas ya no se piden dos veces. Siguen duplicadas `users` y `auth/me`, y son unas 40 peticiones por carga |
| 2.9 | Pagar con la caja en negativo | ⏳ **Pendiente de tu decisión** | Es una regla de negocio; ver sección 9 |
| 2.10 | `npm run build` falla (14 errores TS) | ✅ Corregido (ronda 2) | `npm run build` termina sin errores |
| 2.11 | Texto "Almacén principal" incorrecto | ✅ Corregido (ronda 2) | El aviso nombra el almacén realmente elegido |

---

## 4. Hallazgos nuevos durante la corrección

### 4.1 La interfaz y el backend no usan los mismos nombres de campo (medio) — ✅ corregido en la ronda 2
Al emitir un comprobante, la interfaz envía `tipo` y `ser`, pero el backend lee `td` y `serie` (`orders.py`, `_create_sales_invoice`). Resultado: **siempre se emite "Factura" serie `F001`**, aunque el usuario elija otra cosa. No verifiqué qué opciones ofrece el selector; puede que "Boleta" exista y se ignore.

### 4.2 Un fallo al crear la factura se traga en silencio (alto) — ✅ corregido en la ronda 2
En `_create_sales_invoice` el `insert` de `sales_invoices` está dentro de `try: … except Exception: pass`. Si falla (por ejemplo un número duplicado), **la orden avanza igual al paso "Comprobante" sin que exista factura**. Lo vi en el código; no lo provoqué.

### 4.3 409 intermitente al emitir un comprobante (medio, no reproducido)
En la interfaz, "Emitir comprobante" de OV-2026-0003 devolvió `409 "A record with the same unique value already exists"`, pero el servidor **sí había guardado todo** (factura `F001-96785`, orden en paso 4, cuenta por cobrar). La interfaz quedó con el estado viejo. Con los mismos valores por API dio 200 y, tras el arreglo HTTP/2, no volvió a ocurrir. Causa no confirmada; probablemente un reintento interno durante las fallas de conexión.

### 4.4 Los cobros y pagos no cierran la orden por sí solos (informativo)
Cobrar con `POST /receivables/{id}/collect` deja la factura en "Cobrada" pero la orden sigue en el paso 4 hasta ejecutar el último `complete-step`. La interfaz hace las dos cosas; quien use solo la API puede dejar órdenes a medias.

### 4.5 Los tests de integración no se ejecutaron (informativo)
Los 21 tests de integración del backend se omiten porque requieren `TEST_POSTGREST_URL` (un PostgREST local). Mis cambios en las búsquedas por código solo los cubre el test unitario con cliente falso más las pruebas manuales por API; **no** corrí la suite de integración.

---

## 5. Verificación realizada

**Backend (`pytest`):** 12 pasan, 21 omitidos (integración). Tests nuevos:
- `test_find_by_id_or_code_uses_code_column_for_readable_codes`
- `test_find_by_id_or_code_uses_id_column_for_uuids`
- `test_postgrest_client_does_not_share_one_http2_connection`

**API, flujos completos por código** (`OV-2026-0002`, `OC-2026-0002`): los dos llegan al paso 5. Stock correcto en cada paso. Errores esperados correctos: `GET` de código o UUID inexistente → 404; paso extra tras completar → 400; anular orden cobrada → 400; cancelar transferencia ya recibida → 400.

**Interfaz (Playwright), con el backend real:**
- Venta `OV-2026-0003`: crear, confirmar, despachar (descontó 2 u del stock), facturar (con el 409 intermitente de 4.3), recarga en frío limpia y cobro → "Cobrada · completada".
- Compra `OC-2026-0003`: crear, aprobar, recibir, facturar, pagar → "Pagada · completada". Sin errores.
- Recarga con F5 de una orden: 0 errores de consola, pantalla correcta.

**No verificado:** el flujo desde la interfaz de cotizaciones, solicitudes y transferencias (solo por API); responsive; modo claro.

---

## 6. Datos de prueba nuevos en la base

| Registro | Estado |
|---|---|
| `OV-2026-0002` | Completa (por API, desde `COT-2026-0001`) |
| `OV-2026-0003` | Completa (por interfaz) |
| `OV-2026-0004` | Despachada y facturada, **sin cobrar** (repro por API) |
| `OC-2026-0002` | Completa (por API, desde `SOL-2026-0001`) |
| `OC-2026-0003` | Completa (por interfaz, 5 u a S/ 6) |
| `OC-2026-0004` | Por aprobar (desde `SOL-2026-0002`, reproducción del bug 2.5) |
| `SOL-2026-0002` | Atendida |

Además de lo listado en el informe anterior. El stock de "Verduras" quedó en 11 unidades.

---

## 7. Siguiente paso sugerido

1. **Decidir** si se aplica el recálculo del costo a "Lechuga" (sección 10) y si se rechazan pagos en efectivo sin fondos (2.9).
2. Ejecutar la suite de integración del backend con un PostgREST local.
3. Quitar los registros de prueba de la base.

(Los puntos 2.2, 2.3, 2.4, 2.6, 2.7, 2.10, 4.1 y 4.2 que estaban aquí se resolvieron en las rondas 2 y 3.)

---

## 9. Ronda 2 — correcciones adicionales (2026-10-08)

Todo lo pendiente salvo el costo promedio (2.2), que espera el SQL de la base, y 2.9.

### Backend
- **4.2 Errores tragados** (`orders.py`, `purchase_orders.py`): se quitaron los `try/except: pass` de la guía de despacho, la nota de ingreso, las dos facturas y los **movimientos de stock** (antes, si el movimiento fallaba, la orden avanzaba sin tocar el inventario). Si falla a medias, se borran la guía/nota y sus movimientos y el paso no avanza, así que se puede reintentar. Las líneas sin producto del catálogo se omiten de forma explícita.
- **4.1 Campos** (`_create_sales_invoice`): acepta `tipo`/`ser` de la interfaz (además de `td`/`serie`). Verificado: "Boleta de venta electrónica" emite `B001-…` como Boleta.
- **Despacho sin stock** (nuevo): `_ensure_stock_for_dispatch` rechaza despachar más de lo que hay (`400 "Stock insuficiente de … (hay 11, pide 9999)"`) sin crear guía ni movimientos. Coincide con lo que ya hacían transferencias y ajustes.
- **2.3 Reserva** (`list_stock`): calcula `res` y `disp`.
- **2.4 Anulación**: venta solo antes del despacho; compra solo antes de la recepción.
- Tests: 14 pasan (2 nuevos: la factura no traga errores; entiende los nombres de la interfaz), 21 omitidos (integración).

### Frontend
- **2.6 / 2.11** `NewOrderPage.tsx`: valores efectivos derivados en cada render.
- **2.7 / 2.8** `lib/api.ts` reintenta las lecturas (2 reintentos: 0,4 s y 1,2 s) ante falta de conexión o error 5xx; un 429 no se reintenta. `lib/loadStatus.ts` guarda las lecturas fallidas y `AppShell` muestra el aviso con **Reintentar** (`data/loadAll.ts` reúne las cargas). `loadInventory` y `loadFinance` comparten la petición en curso.
- **2.10** Los 14 errores de TypeScript: imports y variables sin uso, y el bloque inalcanzable de `FlowListPage.tsx` (código después de un `return`, que además causaba los dos errores de nulabilidad).
- **Menores:** favicon incluido en `index.html`; README reescrito (ya no dice que funciona sin backend). Los badges del menú **no** eran un bug: `Sidebar` los sustituye por conteos reales.

### Verificación de la ronda
| Qué | Resultado |
|---|---|
| Reserva: confirmar una venta de 2 u | `reservado` 0→2, `disponible` 11→9; al anular vuelve a 0 y 11 |
| Despachar 9999 u | 400 con mensaje claro; kardex sin cambios; la orden sigue en "confirmada" |
| Anular una orden despachada / compra recibida | 400 con el motivo |
| Anular una orden confirmada / compra aprobada | 200 |
| Aviso de carga fallida (se bloqueó `/customers` en el navegador) | Aparece a los 1,9 s; tras **Reintentar** los clientes cargan |
| Recargar `/ventas/ordenes/nueva` y crear la venta sin tocar desplegables | Crea `OV-2026-0008` (anulada después) |
| `npm run build` | Sin errores |

### Lo que no hice
- **2.2 costo promedio:** quedó para la ronda 3 (sección 10), al recibir el SQL.
- **2.9 caja en negativo:** es una regla de negocio. Rechazar pagos en efectivo sin fondos podría bloquear pagos legítimos si la caja no se alimenta con ingresos manuales, así que no lo cambié sin tu decisión. El backend ya tiene `POST /cash` para registrar ingresos.
- **Duplicados restantes:** `users` y `auth/me` se piden dos veces por carga (cada módulo los pide por su cuenta).
- **Suite de integración:** sigue sin ejecutarse; las pruebas de esta ronda son unitarias y manuales contra la API real.
- No verifiqué en la interfaz el mensaje del despacho rechazado por stock (solo por API).

### Datos de prueba de esta ronda
`OV-2026-0005`, `OV-2026-0006` y `OV-2026-0008` anuladas; `OV-2026-0007` despachada y facturada como boleta (`B001-98182`) sin cobrar; `OC-2026-0005` anulada y `OC-2026-0006` recibida (+1 u de stock). Stock de "Verduras": 11 → 11 en esta ronda (+1 por la recepción, −1 por el despacho).

---

## 10. Ronda 3 — costo promedio (2.2) y esquema de la base

### Qué dice el esquema que pasaste
- `company_settings.cost_method` es `WEIGHTED_AVERAGE` (el único valor que existe) y `products.average_cost` es una columna simple con default 0: el cálculo estaba previsto pero no implementado.
- `company_settings.allow_negative_stock` existe, y la interfaz lo expone como **"Permitir despachar sin stock"**. La validación de stock que añadí en la ronda 2 **no lo respetaba**; ahora sí (si está activo, se puede despachar sin stock suficiente).
- El pegado solo trae tablas: no muestra triggers ni funciones, así que no pude confirmar su ausencia leyéndolo. Lo deduje del comportamiento (tras varias recepciones `average_cost` seguía en 0). No consulté la base en vivo: la lista de proyectos de Supabase tiene varios y ninguno se identifica como el de esta app.

### Cambios (`El-Real-Backend`)
- **`app/services/costing.py`** (nuevo): `weighted_average(stock, avg, qty, costo)`. Con stock cero o negativo toma el costo de la entrada; con stock de costo desconocido (`avg` = 0, datos anteriores al cálculo) también, en vez de promediar contra un cero que no es un costo real.
- **Recepción de compra** (`purchase_orders.py`): por cada línea calcula el nuevo promedio con el stock total del producto (todos los almacenes) **antes** de insertar la entrada, e inserta el movimiento y actualiza `average_cost`. Si una línea posterior falla, restaura los costos anteriores.
- **Despacho** (`orders.py`): el movimiento de salida se valoriza al **costo promedio** y no cambia el promedio. Antes guardaba el **precio de venta** como costo (el kardex mostraba "Salida @13").
- **`scripts/recalc_average_cost.py`** (nuevo): repasa el historial de movimientos y recalcula el costo de cada producto. Sin argumentos solo muestra qué cambiaría; escribe únicamente con `--apply`.
- Tests: 20 pasan (6 nuevos del cálculo), 21 omitidos (integración).

### Verificación (API real, producto nuevo `QA-COSTO-235020`)
| Paso | Resultado |
|---|---|
| Costo inicial | 0 |
| Recepción 10 u a S/ 8 | `average_cost` = 8 |
| Recepción 10 u a S/ 12 | `average_cost` = **10** |
| Valor del stock (`/stock`) | **200** (20 u × 10) |
| Despachar 5 u (precio de venta 20) | El costo sigue en 10; la salida en el kardex vale **10**, no 20 |
| Utilidad bruta del dashboard tras facturar esa venta | 0 → **50** (100 de venta − 50 de costo) |

### Pendiente de tu decisión
- **"Lechuga" sigue con costo 0** (sus movimientos son anteriores al arreglo). La vista previa del script dice que pasaría a **7.24** (stock total 15). Se corrige solo en la siguiente recepción de ese producto (toma el costo de la entrada), o ahora con `python -m scripts.recalc_average_cost --apply`. No lo apliqué porque escribe sobre tus datos.
- Concurrencia: dos recepciones simultáneas del mismo producto podrían calcular el promedio sobre el mismo stock. Para eso haría falta una función SQL o un bloqueo; no lo implementé.

### Datos de prueba de esta ronda
Producto `QA-COSTO-235020`; `OC-2026-0007` y `OC-2026-0008` (recibidas); `OV-2026-0009` (despachada y facturada, sin cobrar). Stock de "Verduras": +20 −5 por ese producto.

---

## 11. Ronda 4 — limpieza de datos de prueba y re-prueba completa (2026-10-08)

### Limpieza
Se borraron **todos** los datos de QA que se habían creado en la base: 17 órdenes (ventas y compras) con sus líneas y eventos, 2 cotizaciones, 2 solicitudes de compra, 6 despachos, 6 recepciones, 6 facturas de venta, 3 facturas de compra, 7 movimientos de tesorería, 16 movimientos de inventario, 2 ajustes y 2 transferencias, además del cliente `QA Cliente SAC`, el producto `QA-COSTO-*` y el almacén `Almacen QA Destino`. Se reiniciaron los contadores de OV, OC, COT, SOL, GR, NI, TR, AJ, COB y PAG.
No se tocaron: los clientes, proveedores, productos y almacenes originales (incluida "Lechuga"), usuarios, roles, configuración ni la auditoría.
Con esto, **los datos de prueba y el costo 0 de "Lechuga" mencionados en las secciones 6, 9 y 10 ya no existen**; el script `recalc_average_cost` dejó de ser necesario.

### Re-prueba desde cero (API real, producto "Lechuga", stock inicial 0 y costo 0)

| Paso | Resultado |
|---|---|
| Compra OC-2026-0001: 10 u a S/ 8 (confirmar, recibir, factura) | Costo promedio **8** ✅ |
| Compra OC-2026-0002: 10 u a S/ 12 | Costo promedio **10**, stock 20 ✅ |
| Venta OV-2026-0001: 5 u a S/ 20 — confirmar | Reservado = 5 ✅ |
| Despachar | Stock 15; salida en el kardex valorada a **10** (costo, no precio); el costo promedio sigue en 10 ✅ |
| Emitir comprobante, cobrar en efectivo | Saldo por cobrar 0 ✅ |
| Pagar las dos facturas de compra | Saldo por pagar 0 ✅ |
| Despachar 999 u con 15 en stock | Rechazado: "Stock insuficiente … (hay 15, pide 999)" ✅ |
| Anular una orden ya despachada | Rechazado ✅ |

### Notas de la prueba
- **Caja negativa (2.9):** la prueba cobró 118 y pagó 236 en efectivo; la caja quedó en −118 y el sistema lo permitió. Sigue pendiente de decisión de negocio (¿rechazar pagos en efectivo sin fondos?).
- **`payment_method` en cobros/pagos:** si llega un texto libre (por ejemplo `"Efectivo"`), el backend responde 400 `"Invalid value in request"` sin indicar el campo. La interfaz no envía ese campo, así que no la afecta; es solo un mensaje de error poco claro para quien use la API directamente.

### Para quien administra la base de Supabase: `dashboard_summary`
La función `dashboard_summary` (`El-Real-Backend/database/004_dashboard.sql`) calcula bien con la definición que tiene, pero esa definición tiene dos consecuencias a decidir:
1. **Ventas y utilidad bruta cuentan toda orden de venta no anulada**, aunque no se haya despachado ni facturado (filtro `not o.is_cancelled`). Una orden confirmada que nunca se despacha infla ventas y utilidad. Con la prueba: una orden de 999 u imposible de despachar sumó 23 576 a ventas y 9 990 a la utilidad bruta.
2. **El costo de la utilidad es el costo promedio *actual*** del producto (`products.average_cost`), no el costo al momento de la venta; si el costo cambia después, la utilidad histórica cambia.

Opciones: filtrar por órdenes con `current_step >= 3` (despachadas) o por las que tienen factura emitida, y/o tomar el costo desde `inventory_movements.unit_cost` de la salida. Es un cambio de definición de negocio; no se modificó nada.

### Estado final
- Verificado: flujos de venta y compra, costo promedio ponderado, stock, reservas, cobros y pagos.
- Pendiente de decisión: caja sin fondos (2.9) y la definición de "ventas" del dashboard.
- Datos que quedan de la última prueba (se pueden borrar): cliente `Cliente Prueba Final` (CLI-00004), `OC-2026-0001/0002`, `OV-2026-0001` (cobrada) y `OV-2026-0002` (999 u, confirmada, sin despachar), más los movimientos de tesorería y de inventario asociados.

---

## 8. Archivos modificados

**`El-Real-Backend`**
```
app/repositories/client.py          + find_by_id_or_code, use_http1 (HTTP/1.1 para PostgREST)
app/services/orders.py              3 búsquedas por código
app/services/purchase_orders.py     3 búsquedas por código
app/services/purchase_requests.py   4 búsquedas por código
app/services/quotations.py          3 búsquedas por código
app/services/inventory.py           3 búsquedas por código
tests/test_unit.py                  + 5 tests en total
```
Ronda 2: además `orders.py` (stock al despachar, anulación, factura, errores), `purchase_orders.py` (anulación, errores) e `inventory.py` (reserva).  
Ronda 3: `app/services/costing.py` (nuevo), `scripts/recalc_average_cost.py` (nuevo), y cambios en `purchase_orders.py` y `orders.py`.

**`enterprisecloud-app`**
```
src/features/order/OrderPage.tsx    useCallback → funciones normales (pantalla en blanco)
INFORME_PRUEBAS_SISTEMA.md          informe de pruebas (anterior)
PROGRESO_CORRECCIONES.md            este documento
```
Ronda 2: `src/lib/api.ts`, `src/lib/loadStatus.ts` (nuevo), `src/data/loadAll.ts` (nuevo), `src/App.tsx`, `src/components/AppShell.tsx`, `src/features/order/NewOrderPage.tsx`, `src/features/flowlist/FlowListPage.tsx`, `src/data/domain/{inventory,finance,invoices,masters,quotations}.ts`, `src/pages/configs/{bancos,caja}.ts`, `index.html`, `README.md`.

El backend en el puerto 8000 corre con recarga automática, así que **ya tiene los cambios activos**. Si lo reinicias a mano, funcionarán igual.
