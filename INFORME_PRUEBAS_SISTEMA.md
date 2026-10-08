# Informe de pruebas — EnterpriseCloud (frontend + backend)

**Fecha:** 2026-10-08  
**Alcance:** frontend `enterprisecloud-app` (Vite, `localhost:5173`) contra el backend `El-Real-Backend` (FastAPI, `localhost:8000`, base de datos Supabase).  
**Método:** interfaz manejada con Playwright (login, clientes, nueva venta, nueva compra, confirmar/aprobar) y, donde la interfaz quedó bloqueada, llamadas directas a la API con scripts. Se usó una cuenta de prueba (rol Administrador).  
**Código modificado:** ninguno. Este informe es el único archivo nuevo.

---

## 1. Resumen

| | |
|---|---|
| **Veredicto** | Los flujos de venta y compra **no se pueden completar desde la interfaz**. La causa es un bug del backend (sección 2.1). |
| **Lo que sí funciona** | Totales e IGV, stock por recepción/despacho/ajuste/transferencia, cuentas por cobrar/pagar, cobro parcial/total, caja, validaciones de entrada y autenticación. |
| **Bugs críticos** | 1 (afecta a 17 puntos del código) |
| **Bugs altos** | 4 |
| **Bugs medios** | 6 |
| **Menores** | 4 |

Los flujos completos solo se pudieron recorrer usando el **UUID** de cada documento por API. Con el **código** (`OV-2026-0001`), que es lo que usa la interfaz, fallan.

---

## 2. Bugs

### 2.1 CRÍTICO — Toda operación por código de documento devuelve 400

**Síntoma.** En la interfaz, "Confirmar orden de venta" y "Aprobar orden de compra" muestran el mensaje genérico *"Invalid value in request"* y la orden no avanza.

**Evidencia (reproducido).**

| Llamada | Por código | Por UUID |
|---|---|---|
| `GET /sales-orders/{x}` | 400 | 200 |
| `POST /sales-orders/{x}/complete-step` | 400 | 200 |
| `GET /purchase-orders/{x}` | 400 | 200 |
| `POST /purchase-orders/{x}/complete-step` | 400 | 200 |
| `GET /quotations/{x}` | 400 | 200 |
| `POST /quotations/{x}/status` | 400 | 200 |
| `POST /quotations/{x}/convert` | 400 | 200 |
| `POST /purchase-requests/{x}/status` | 400 | 200 |
| `POST /purchase-requests/{x}/convert` | 400 | (ver 2.5) |
| `POST /transfers/{x}/dispatch` | 400 | 200 |

**Causa raíz.** Cada servicio busca primero `.eq("id", <valor>)` y, si no hay resultado, `.eq("code", <valor>)`. Como `id` es una columna `uuid`, Postgres lanza el error `22P02` (sintaxis UUID inválida) en la primera consulta, **antes** de llegar a la búsqueda por código. `app/repositories/client.py:41-42` traduce ese error a `400 "Invalid value in request"`.

**Dónde está el patrón** (`.eq("id", id_or_code)` seguido de `or … .eq("code", …)`), 17 sitios:

- `app/services/orders.py`: líneas 163, 281, 467
- `app/services/purchase_orders.py`: 129, 212, 348
- `app/services/purchase_requests.py`: 130, 183, 224, 249
- `app/services/quotations.py`: 142, 211, 274
- `app/services/inventory.py`: 257, 292, 324

Verificado por reproducción: `GET` y `complete-step` de órdenes, `GET`/`status`/`convert` de cotizaciones, `status` y `convert` de solicitudes, `dispatch` de transferencias. El resto (cancelar, recibir, editar, eliminar) comparte el mismo patrón en el código pero no lo ejecuté.

**Arreglo sugerido.** Un único helper que decida por formato:

```python
from uuid import UUID

def _by_id_or_code(table, value, **filters):
    try:
        UUID(str(value)); col = "id"
    except ValueError:
        col = "code"
    q = db().table(table).select("*").eq(col, value)
    for k, v in filters.items():
        q = q.eq(k, v)
    return first(q)
```

y sustituir los 17 sitios. Alternativa de parche mínimo en el frontend: enviar siempre el UUID en las URLs, pero lo correcto es arreglar el backend.

**Consejo extra.** El mensaje *"Invalid value in request"* oculta la causa real. Para los errores `22P02` conviene devolver un mensaje específico, o un 404 si el identificador no existe.

---

### 2.2 ALTO — El costo promedio del producto nunca se calcula

**Síntoma.** Tras recibir 10 unidades a costo S/ 8, el kardex registra la entrada con `costo: 8.0`, pero `products.average_cost` sigue en `0.0`. Consecuencias observadas:

- El valor del stock sale `0`.
- La utilidad bruta del dashboard sale `0` / margen `0%` aunque hubo una venta con margen.
- Los movimientos de ajuste y transferencia salen con `costo: 0.0`.

**Causa.** Ninguna parte del backend escribe `average_cost`: ni el código Python ni los scripts SQL (`database/001`–`004`) contienen un trigger o función que lo actualice. Solo se **lee** (`services/inventory.py:72,390,409` y `database/004_dashboard.sql`). El comentario en `app/schemas/masters.py:79` dice que "lo calcula el sistema con los movimientos de inventario", pero ese cálculo no existe.

**El README del frontend** también promete "costo promedio" en los flujos, así que es una funcionalidad documentada que no está implementada.

**Arreglo sugerido.** Recalcular en cada entrada (recepción de compra): `nuevo = (stock_actual × costo_actual + qty × costo_entrada) / (stock_actual + qty)`. Idealmente en una función SQL o en una transacción única junto con el movimiento de kardex.

---

### 2.3 ALTO — La reserva de stock no existe

**Síntoma.** La pantalla de la orden dice *"Al confirmar se reserva el stock"* y *"Reserva 1 unidades en el almacén seleccionado"*. Tras confirmar, el stock sigue con `reservado = 0` y `disponible` sin cambio.

**Causa.** `app/services/inventory.py:83` tiene `"res": 0` fijo. Ningún flujo calcula ni persiste reservas, así que dos órdenes confirmadas pueden comprometer el mismo stock.

**Arreglo sugerido.** Calcular `reservado` como la suma de líneas de órdenes confirmadas no despachadas, o implementar la reserva real. Mientras tanto, cambiar el texto de la interfaz para no prometerla.

---

### 2.4 ALTO — Anular una orden ya facturada y cobrada deja todo inconsistente

**Síntoma.** `POST /sales-orders/{id}/cancel` sobre `OV-2026-0001` (despachada, facturada y cobrada) devolvió **200**. Después:

- El stock **no se restituyó** (la salida de 1 unidad sigue en el kardex).
- La factura `F001-94822` y la cuenta por cobrar siguen como "Cobrada".
- Los cobros siguen en caja.
- La orden figura `cancelled: true` y desaparece de las ventas del dashboard.

**Causa.** `cancel_sale_order` (`orders.py:460-502`) solo marca `is_cancelled`; no revierte stock, comprobante ni cobros. Solo se bloquea si `current_step >= MAX_STEP`.

**Matiz (importante).** En mi prueba por API **no ejecuté** el último `complete-step` (Cobro), por lo que la orden quedó en `done=4` y la guarda de "ya cobrada" no se activó. En la interfaz, ese paso podría avanzar la orden a 5 y bloquear la anulación. Sin embargo, el problema de fondo persiste: **una orden despachada o facturada (pasos 3–4) sí se puede anular y no se revierte nada**.

**Arreglo sugerido.** Bloquear la anulación desde el despacho, o implementar la reversión (nota de crédito, devolución al stock, anulación de cobros).

---

### 2.5 ALTO — Convertir una solicitud de compra devuelve 500 pero ejecuta la operación

**Síntoma.** `POST /purchase-requests/{uuid}/convert` responde `500 Internal server error`. Sin embargo el efecto **sí se aplicó**: la solicitud `SOL-2026-0001` quedó "Atendida" y existe la orden `OC-2026-0002`. Un reintento daría "ya tiene una orden asociada", por lo que el usuario vería un error en una operación que sí se hizo.

**Causa.** No determinada. La excepción ocurre **después** de las escrituras (`purchase_requests.py:308-313`, probablemente al construir o serializar la respuesta `{"request": …, "order": …}`). El `traceback` solo se registra en la consola de uvicorn (`core/errors.py:72`), que no pude leer. El flujo equivalente de cotización → orden (`/quotations/{uuid}/convert`) sí funciona.

**Para diagnosticar.** Reproducir con un `convert` y leer el traceback en la consola del backend. También queda pendiente que el flujo no es atómico: varias escrituras sin transacción.

---

### 2.6 MEDIO — "Elige un cliente." con un cliente visible (frontend)

**Síntoma.** En *Nueva venta* el desplegable muestra "QA Cliente SAC", pero al pulsar *Crear venta* aparece **"Elige un cliente."**

**Causa.** `src/features/order/NewOrderPage.tsx:20-21` inicializa el estado una sola vez:

```ts
const [partyId, setPartyId] = useState<number | ''>(parties[0]?._id ?? '');
const [warehouse, setWarehouse] = useState(String(... whs[0]));
```

Si los datos del backend llegan **después** del primer render, `partyId` queda `''` aunque el `<select>` muestre la primera opción, y `warehouse` queda con el texto `"undefined"`. Pasa casi siempre tras recargar la página; no pasa si se llega desde dentro de la app con los datos ya cargados (lo comprobé: así la venta se creó bien).

**Arreglo sugerido.** Derivar el valor efectivo en cada render (`const effectiveId = partyId === '' ? parties[0]?._id : partyId`) o inicializar con un `useEffect` cuando lleguen los datos.

---

### 2.7 MEDIO — Un fallo de carga se muestra como "no hay datos"

**Síntoma.** Con las cargas fallidas, la app mostró *"Aún no hay registros"* en Clientes y *"Primero registra un cliente"* en Nueva venta, cuando sí existían 2 clientes. No hay mensaje de error ni reintento: el usuario puede creer que perdió sus datos y duplicar registros.

**Arreglo sugerido.** Distinguir "cargando", "error" y "vacío" por cada cargador (`loadMasters`, etc.), con botón de reintentar. Verificado en Clientes y Nueva venta; no revisé el resto de pantallas.

---

> **Actualización (ver `PROGRESO_CORRECCIONES.md`):** los fallos intermitentes de este punto eran respuestas 500 del backend por una conexión HTTP/2 compartida entre hilos, no el límite de tasa. Ya está corregido; las 41 peticiones por carga siguen pendientes.

### 2.8 MEDIO — La carga inicial es pesada y falla de forma intermitente

**Datos medidos.** Una carga completa dispara **41 peticiones** al backend (`App.tsx:96-110`). Varias se piden **dos veces**: `stock`, `kardex`, `transfers`, `adjustments`, `receivables`, `payables`, `cash`, `bank-movements`, `users` y `auth/me`.

**Síntoma.** En cargas en frío, entre 4 y 8 de esas peticiones fallaron con `net::ERR_FAILED`, que el navegador reporta como *"blocked by CORS policy"*. El resultado varía entre recargas.

**Lo que se sabe y lo que no.**

- Confirmado: el backend limita a **120 peticiones por minuto por IP** (`main.py:14,30`) y respondió `429` en una ráfaga de 60 desde `curl`.
- **No confirmado** que ese límite explique los fallos de la interfaz: hubo cargas que fallaron con la ventana limpia y muy por debajo de 120.
- Una ráfaga de 15 peticiones lanzada desde la página ya cargada pasó completa (15 de 15, estado 200).
- Los preflight y las respuestas `4xx` sí traen cabeceras CORS por `curl`, así que el error de CORS del navegador parece un síntoma y no la causa.

**Arreglo sugerido.** Eliminar las cargas duplicadas, cargar por pantalla (no todo al iniciar) y revisar los logs del backend durante una carga en frío.

---

### 2.9 MEDIO — Se permite pagar con la caja en negativo

`POST /payables/{id}/pay` con S/ 94.40 en efectivo, con S/ 15.34 en caja, devolvió 200 y la caja quedó en **−79.06**. Si no es intencional, falta validar fondos.

---

### 2.10 MEDIO — `npm run build` falla (14 errores de TypeScript)

Variables sin usar (`inventory.ts:3`, `invoices.ts:3`, `masters.ts:98`, `quotations.ts:183`, `NewOrderPage.tsx:6,10`, `bancos.ts:3`, `caja.ts:4`, `FlowListPage.tsx:7,18`) y dos errores reales de nulabilidad en `FlowListPage.tsx:367` y `:374` (`'editor' is possibly 'null'`). El modo desarrollo funciona; **no se puede generar el build de producción**.

---

### 2.11 MEDIO — Texto de almacén incorrecto

*Nueva venta* muestra "Disponible en **Almacén principal**: 0 unidad" aunque el almacén elegido es "Verduras". `warehouses()` en `src/data/domain/orders.ts:59` devuelve `['Almacén principal']` como valor por defecto cuando aún no hay almacenes cargados, y esa etiqueta se usa en el aviso.

---

### 2.12 MENORES

- Los badges del menú (`'2'`, `'23'`, `'5'`, `'7'`) están fijos en `src/components/nav.ts`. No los pude ver con la base vacía, así que no sé si se muestran.
- Falta `favicon.ico` (404 en cada carga).
- El README dice que "todo funciona en el navegador, sin backend", pero el código llama a la API (`src/lib/api.ts`). Está desactualizado.
- Con una ventana de ~1000 px la página mostró scroll horizontal. Lo vi en capturas, no lo medí.

---

## 3. Lo que funciona (verificado)

### Interfaz
- Login con credenciales válidas; el dashboard carga con el usuario y rol correctos.
- Crear cliente (`CLI-00002`): aparece en el listado.
- Crear venta (`OV-2026-0001`) y orden de compra (`OC-2026-0001`) cuando los datos ya están cargados.
- El cálculo del IGV y total en pantalla es correcto (venta S/ 15.34; compra S/ 94.40).

### Flujos por API (con UUID)

| Flujo | Resultado |
|---|---|
| Compra: aprobar → recepción → factura → pago | OK. Stock 0→10, kardex con costo 8, cuenta por pagar 94.40, pago registrado |
| Venta: confirmar → despacho → comprobante → cobro | OK. Stock 10→9, guía y factura generadas, cuenta por cobrar 15.34 |
| Cobro parcial (5.00) y resto (10.34) | OK. Saldo 0, estado "Cobrada", caja +15.34 |
| Cotización: DRAFT→SENT→APPROVED→convertir | OK. Genera la orden de venta (`OV-2026-0002`) |
| Solicitud: aprobar | OK |
| Ajuste de stock (+5 sobrante, −2 merma) | OK. Stock 9→12 |
| Transferencia entre almacenes (4 u) | OK. Despacho 12→8 y recepción +4 en destino |

### Validaciones que respondieron bien

| Caso | Respuesta |
|---|---|
| Sin token / token inválido | 401 |
| Cantidad negativa o 0 | 400 con mensaje por campo |
| Venta sin líneas | 400 |
| Cliente inexistente | 400 "Cliente no encontrado" |
| RUC duplicado | 409 |
| Sobrepago de una factura | 400 "El monto supera el saldo pendiente (0)" |
| Ajuste de merma mayor al stock | 400 "Stock insuficiente… (hay 12.0)" |
| Transferencia al mismo almacén | 400 "Origen y destino deben ser distintos" |
| Despachar más que el stock | 400 "Stock insuficiente… (hay 8.0, pide 9999.0)" |
| Convertir cotización rechazada o ya convertida | 400 "Solo se puede convertir una cotización aprobada" |

---

## 4. No probado

- Documentos (subida y descarga), Reportes y su programación.
- Permisos por rol (crear un rol restringido y comprobar el bloqueo en pantalla y en API), Usuarios, Auditoría.
- Bancos y conciliación; cobro y pago por banco (`channel: BANK`). No hay cuentas bancarias creadas.
- Pasos de la orden desde la interfaz después del paso 2 (bloqueado por 2.1).
- Cancelar orden de compra, recibir/cancelar transferencia por código, editar y eliminar registros.
- Comprobantes: estado SUNAT y anulación de factura (`tax-status`, `void`).
- Modo claro, responsive en móvil, accesibilidad.
- Bloqueo de cuenta tras intentos fallidos (no lo ejercité para no bloquear la cuenta de prueba).

---

## 5. Datos de prueba que quedaron en la base

Creados durante las pruebas; conviene borrarlos o usar otra base antes de producción.

| Tipo | Registro |
|---|---|
| Cliente | `CLI-00002` · QA Cliente SAC |
| Venta | `OV-2026-0001` (anulada, con cobros) · `OV-2026-0002` (desde `COT-2026-0001`, sin avanzar) |
| Cotizaciones | `COT-2026-0001` (convertida) · una segunda rechazada |
| Compra | `OC-2026-0001` (pagada, factura `F002-QA001`) · `OC-2026-0002` (desde `SOL-2026-0001`) |
| Solicitud | `SOL-2026-0001` (atendida) |
| Inventario | Ajustes `AJ-2026-0001/0002`, transferencia `TR-2026-0001`, almacén "Almacen QA Destino" |
| Finanzas | Cobros `COB-2026-0001/0002`, pago `PAG-2026-0001` (caja en −79.06) |

Los registros `CLI-00001`, `PRV-00001` ("APM INVERSIONES") y el producto "Lechuga" ya existían antes de la prueba.

---

## 6. Orden de corrección sugerido

1. **2.1** helper de búsqueda por id/código (desbloquea todo el flujo en la interfaz).
2. **2.5** diagnosticar el 500 de `convert` en solicitudes.
3. **2.2** cálculo del costo promedio (afecta utilidad, valor de stock y reportes).
4. **2.4** y **2.3** reglas de anulación y reserva de stock.
5. **2.6** y **2.7** estado inicial del formulario y estados de carga/error en el frontend.
6. **2.10** errores de TypeScript (necesarios para el build de producción).
7. **2.8**, **2.9**, **2.11** y menores.

---

## 7. Cómo reproducir lo principal

```text
# Bug 2.1 (por API)
POST /api/v1/auth/login                              -> accessToken
POST /api/v1/sales-orders                            -> crea OV-xxxx (guarda "id" y "code")
POST /api/v1/sales-orders/<code>/complete-step       -> 400 "Invalid value in request"
POST /api/v1/sales-orders/<uuid>/complete-step       -> 200

# Bug 2.2
1. Crear compra y recibir 10 u a costo 8.
2. GET /api/v1/kardex   -> costo: 8.0
3. GET /api/v1/products -> average_cost: 0.0

# Bug 2.6 (interfaz)
Recargar /ventas/ordenes/nueva y pulsar "Crear venta" -> "Elige un cliente."
```
