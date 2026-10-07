# EnterpriseCloud Backend

API REST con NestJS, TypeScript y Prisma (PostgreSQL / Supabase), independiente del frontend.

**Estado:** Fase 1 completa (seguridad, autenticación, usuarios, roles, permisos, auditoría base).
Los módulos de negocio (clientes, proveedores, productos, inventario, ventas, compras, finanzas,
documentos, reportes) siguen vacíos y se implementan en las siguientes fases.

## Puesta en marcha

Requisitos: Node.js 20+ y una base PostgreSQL (Supabase, Session Pooler, puerto 5432).

```bash
cd backend
npm install
cp .env.example .env        # en Windows: Copy-Item .env.example .env
```

Edita `.env`:

- `DATABASE_URL`: cadena del Session Pooler de Supabase.
- `JWT_SECRET`: genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres): el primer administrador.

```bash
npx prisma generate
npx prisma migrate dev --name init   # crea y aplica la migración inicial
npm run db:seed                      # permisos, roles base, configuración y administrador
npm run start:dev                    # http://localhost:3000/api
```

Notas sobre la migración:

- Si `migrate dev` falla con `P3014` (no puede crear la base sombra, habitual en Supabase), genera el SQL a mano:
  `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  guárdalo en `prisma/migrations/0001_init/migration.sql` y aplícalo con `npm run db:deploy`.
- El esquema usa la extensión `citext`. Si falla por permisos, ejecuta antes en el SQL Editor de Supabase:
  `create extension if not exists citext;`

El seed es idempotente: puedes ejecutarlo de nuevo sin duplicar datos ni pisar los permisos que cambies luego.

## Seguridad

- **Todo requiere sesión** (JWT `Bearer`) salvo `POST /api/auth/login` y `GET /api/health` (marcados con `@Public()`).
- **Autorización por rol, denegar por defecto:** cada ruta debe declarar `@RequirePermission('modulo', 'accion')`
  o `@AnyAuthenticated()`. Si se olvida, responde 403. Acciones: `view`, `create`, `edit`, `delete`, `approve`.
  El rol `ADMIN` tiene acceso total.
- **Bloqueo de cuenta:** al llegar a `maxLoginAttempts` (Configuración, 5 por defecto) la cuenta pasa a `LOCKED`
  hasta que un administrador la reactive (`PATCH /users/:id/status`).
- **Límite de peticiones:** 10 intentos de login por minuto y por IP, 120 peticiones/min en general.
  Detrás de un proxy o balanceador configura `trust proxy` para que se use la IP real.
- Un usuario con `users:create` o `users:edit` no puede crear, editar ni asignar el rol Administrador,
  y nadie puede cambiar su propio estado o rol.
- Contraseñas con argon2id; las sesiones se guardan hasheadas y se pueden revocar (logout, cambio de contraseña).
- Todo ingreso, cambio de usuario y cambio de contraseña queda en `audit_events`.

## Endpoints (Fase 1)

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` | público |
| POST | `/api/auth/logout` | sesión |
| GET | `/api/auth/me` | sesión (incluye `permissions`) |
| POST | `/api/auth/change-password` | sesión |
| GET | `/api/users`, `/api/users/:id`, `/api/users/by-email/:email` | `users:view` |
| POST | `/api/users` | `users:create` |
| PATCH | `/api/users/:id`, `/status`, `/role` | `users:edit` |
| POST | `/api/users/:id/reset-password` | `users:edit` |
| GET | `/api/roles`, `/api/roles/:id` | `roles:view` |
| GET | `/api/roles/:id/permissions`, `/api/permissions`, `/api/permissions/catalog` | `permissions:view` |
| GET | `/api/health` | público |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@tuempresa.pe","password":"tu-contraseña"}'
# → { "accessToken": "...", "tokenType": "Bearer", "expiresIn": "8h", "user": {...}, "permissions": { "users": ["view","create",...] } }
```

Errores: `{ "statusCode": 401, "message": "...", "code": "ACCOUNT_LOCKED", "timestamp": "...", "path": "..." }`
(`code` solo aparece en `ACCOUNT_LOCKED` y `ACCOUNT_INACTIVE`).

## Pruebas

```bash
npm run build
npm run test:security
```

Levanta la app real con la base de datos simulada en memoria y verifica rutas protegidas, permisos,
escalada de privilegios, bloqueo, sesiones, auditoría y límite de peticiones. No requiere base de datos.

## Estructura

- `src/auth/`: login, sesiones, guards globales y decoradores (`@Public`, `@RequirePermission`, `@AnyAuthenticated`).
- `src/permissions/`: catálogo de módulos/acciones y consulta de permisos efectivos.
- `src/users/`, `src/roles/`: gestión de cuentas y roles.
- `src/audit/`: servicio global de auditoría.
- `prisma/schema.prisma`, `prisma/seed.ts`: modelo de datos y datos iniciales.
