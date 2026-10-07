/**
 * Seed inicial e idempotente: se puede ejecutar varias veces sin duplicar nada.
 * Crea el catálogo de permisos, los roles base (con la matriz que ya usa el frontend),
 * la configuración de la empresa y el primer usuario Administrador.
 *
 * Uso: npm run db:seed   (requiere DATABASE_URL y SEED_ADMIN_PASSWORD en .env)
 */
import { PrismaClient, RoleType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import 'dotenv/config';
import {
  ADMIN_ROLE_CODE,
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
} from '../src/permissions/permissions.catalog';

const prisma = new PrismaClient();

type Flags = [view: boolean, create: boolean, edit: boolean, del: boolean, approve: boolean];
const P = (...f: number[]): Flags => f.map(Boolean) as Flags;
const FULL = P(1, 1, 1, 1, 1);
const VIEW = P(1, 0, 0, 0, 0);
const WORK = P(1, 1, 1, 0, 0);
const NONE = P(0, 0, 0, 0, 0);

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  type: RoleType;
  flags: (group: string, module: string) => Flags;
}

const isIn = (m: string, list: string[]) => list.includes(m);

/** Misma matriz por defecto que defaultPermissions() del frontend (src/data/permissions.ts). */
const ROLES: RoleSeed[] = [
  { code: ADMIN_ROLE_CODE, name: 'Administrador', type: RoleType.SYSTEM, description: 'Acceso total y configuración del sistema', flags: () => FULL },
  { code: 'MANAGER', name: 'Gerente', type: RoleType.SYSTEM, description: 'Aprueba compras, descuentos y anulaciones', flags: (g) => (g === 'Sistema' ? VIEW : FULL) },
  {
    code: 'SALES', name: 'Ventas', type: RoleType.CUSTOM, description: 'Cotizaciones, órdenes de venta y clientes',
    flags: (g, m) =>
      g === 'Ventas' ? (m === 'receipts' ? P(1, 1, 0, 0, 0) : WORK)
        : m === 'customers' ? WORK
          : isIn(m, ['dashboard', 'reports', 'stock', 'documents', 'products']) ? VIEW : NONE,
  },
  {
    code: 'PURCHASING', name: 'Compras', type: RoleType.CUSTOM, description: 'Solicitudes, órdenes de compra y proveedores',
    flags: (g, m) =>
      g === 'Compras' || m === 'suppliers' ? WORK
        : isIn(m, ['dashboard', 'reports', 'stock', 'kardex', 'documents', 'products', 'payables']) ? VIEW : NONE,
  },
  {
    code: 'WAREHOUSE', name: 'Almacén', type: RoleType.CUSTOM, description: 'Despachos, recepciones, transferencias y ajustes',
    flags: (g, m) =>
      g === 'Inventario' || m === 'goods-receipts' ? WORK
        : m === 'sales-orders' ? P(1, 0, 1, 0, 0)
          : m === 'purchase-requests' ? P(1, 1, 0, 0, 0)
            : isIn(m, ['dashboard', 'products', 'warehouses', 'documents']) ? VIEW : NONE,
  },
  {
    code: 'ACCOUNTING', name: 'Contabilidad', type: RoleType.CUSTOM, description: 'Comprobantes, cuentas por cobrar y pagar, caja y bancos',
    flags: (g, m) =>
      g === 'Finanzas' ? FULL
        : m === 'receipts' ? P(1, 1, 1, 0, 1)
          : isIn(m, ['dashboard', 'reports', 'documents', 'customers', 'suppliers', 'audit']) ? VIEW : NONE,
  },
];

async function seedPermissions() {
  const permissionIds = new Map<string, string>();
  for (const { modules } of PERMISSION_GROUPS) {
    for (const { key } of modules) {
      for (const action of PERMISSION_ACTIONS) {
        const permission = await prisma.permission.upsert({
          where: { moduleKey_actionKey: { moduleKey: key, actionKey: action } },
          update: {},
          create: { moduleKey: key, actionKey: action },
        });
        permissionIds.set(`${key}:${action}`, permission.id);
      }
    }
  }
  return permissionIds;
}

async function seedRoles(permissionIds: Map<string, string>) {
  const ids = new Map<string, string>();
  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: { code: role.code, name: role.name, description: role.description, roleType: role.type },
    });
    ids.set(role.code, row.id);

    // Solo se crean los permisos que faltan: nunca se pisan los cambios hechos desde la pantalla de Permisos.
    const existing = await prisma.rolePermission.count({ where: { roleId: row.id } });
    if (existing > 0) continue;

    const data = PERMISSION_GROUPS.flatMap(({ group, modules }) =>
      modules.flatMap(({ key }) => {
        const flags = role.flags(group, key);
        return PERMISSION_ACTIONS.map((action, i) => ({
          roleId: row.id,
          permissionId: permissionIds.get(`${key}:${action}`)!,
          granted: flags[i],
        }));
      }),
    );
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }
  return ids;
}

/** Datos de ejemplo del frontend (DEFAULT_SETTINGS); edítalos desde Configuración. */
async function seedCompanySettings() {
  await prisma.companySetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      taxId: '20601987451',
      legalName: 'Comercializadora Andina de Materiales S.A.C.',
      fiscalAddress: 'Av. Argentina 1820, Cercado de Lima, Lima',
      invoiceSeries: 'F001',
      receiptSeries: 'B001',
      dispatchSeries: 'T001',
      creditNoteSeries: 'FC01',
    },
  });
}

async function seedAdmin(roleId: string) {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador del sistema';

  if (!email || !password) {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos: no se crea el usuario administrador.');
    return;
  }
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`El usuario ${email} ya existe; no se modifica.`);
    return;
  }
  await prisma.user.create({
    data: {
      fullName: name,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      area: 'Sistemas',
      status: UserStatus.ACTIVE,
      roleId,
    },
  });
  console.log(`Administrador creado: ${email}`);
}

async function main() {
  const permissionIds = await seedPermissions();
  const roleIds = await seedRoles(permissionIds);
  await seedCompanySettings();
  await seedAdmin(roleIds.get(ADMIN_ROLE_CODE)!);
  console.log('Seed completado.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
