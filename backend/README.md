# EnterpriseCloud Backend

Backend REST independiente del frontend, construido con NestJS, TypeScript y Prisma. Los módulos de dominio están preparados como estructura; todavía no implementan operaciones empresariales.

## Requisitos

- Node.js 20 o superior
- PostgreSQL en Supabase

## Desarrollo

```bash
cd backend
npm install
Copy-Item .env.example .env
```

Completa `DATABASE_URL` con la cadena URI de Supabase **Session Pooler** (puerto `5432`), adecuada para este servidor NestJS de larga duración. En esta fase no se necesita `DIRECT_URL`. `CORS_ORIGIN` admite varios orígenes separados por comas.

```bash
npm run prisma:generate
npm run start:dev
```

La API escucha en `http://localhost:3000/api`; el puerto se configura con `PORT`. El servidor valida el entorno al iniciar y aplica Helmet, CORS y `ValidationPipe` global. Los errores HTTP se responden con un formato uniforme y los errores internos no exponen detalles.

## Prisma

El esquema inicial no define modelos. Cuando se incorporen modelos, crea una migración con `npx prisma migrate dev --name nombre_migracion` y genera el cliente con `npm run prisma:generate`.

## Estructura

- `src/common/`: filtros y componentes compartidos.
- `src/config/`: validación y carga de configuración.
- `src/prisma/`: cliente Prisma compartido.
- `src/{auth,users,roles,permissions,clients,suppliers,products,inventory,sales,purchases,finance,documents,reports,audit}/`: módulos listos para crecer.
- `prisma/`: esquema y futuras migraciones.