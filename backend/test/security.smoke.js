/**
 * Prueba de humo de seguridad: levanta la app real de NestJS con PrismaService SIMULADO en memoria
 * (no necesita base de datos) y verifica autenticación, autorización, bloqueo y auditoría.
 *
 * Uso:  npm run build && npm run test:security
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-smoke-test-secret-0123456789';

const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, ForbiddenException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const argon2 = require('argon2');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PermissionsGuard } = require('../dist/auth/guards/permissions.guard');

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
};

const pick = (obj, select) => {
  if (!obj) return null;
  if (!select) return { ...obj };
  const out = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = obj[k];
  return out;
};

async function buildState() {
  const roles = {
    admin: { id: randomUUID(), code: 'ADMIN', name: 'Administrador', roleType: 'SYSTEM', isActive: true },
    sales: { id: randomUUID(), code: 'SALES', name: 'Ventas', roleType: 'CUSTOM', isActive: true },
  };
  const mk = async (email, role, status, password) => ({
    id: randomUUID(), roleId: role.id, role, fullName: email.split('@')[0], email, area: null, status,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    mfaEnabled: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  const users = [
    await mk('admin@test.pe', roles.admin, 'ACTIVE', 'AdminPass-12345'),
    await mk('sales@test.pe', roles.sales, 'INVITED', 'SalesPass-12345'),
    await mk('victim@test.pe', roles.sales, 'ACTIVE', 'VictimPass-12345'),
  ];
  // Rol Ventas: solo puede VER clientes.
  const grants = new Set([`${roles.sales.id}|customers|view`]);
  return { roles, users, sessions: [], audit: [], grants };
}

function makePrisma(s) {
  const byWhere = (w) => s.users.find((u) => (w.email ? u.email === w.email : u.id === w.id));
  const apply = (u, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'role') { u.role = Object.values(s.roles).find((r) => r.id === v.connect.id); u.roleId = u.role.id; }
      else if (v && typeof v === 'object' && 'increment' in v) u[k] += v.increment;
      else u[k] = v;
    }
  };
  const prisma = {
    $queryRaw: async () => [1],
    $transaction: async (arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
    user: {
      findUnique: async ({ where, select }) => pick(byWhere(where), select),
      findUniqueOrThrow: async ({ where, select }) => pick(byWhere(where), select),
      findMany: async ({ select }) => s.users.map((u) => pick(u, select)),
      create: async ({ data, select }) => {
        const role = Object.values(s.roles).find((r) => r.id === data.role.connect.id);
        const u = { id: randomUUID(), roleId: role.id, role, fullName: data.fullName, email: data.email, area: data.area,
          status: 'INVITED', passwordHash: data.passwordHash, mfaEnabled: false, failedLoginAttempts: 0, lockedUntil: null,
          lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
        s.users.push(u);
        return pick(u, select);
      },
      update: async ({ where, data, select }) => { const u = byWhere(where); apply(u, data); return pick(u, select); },
      updateMany: async ({ where, data }) => {
        const u = byWhere(where);
        if (!u || (where.status?.in && !where.status.in.includes(u.status))) return { count: 0 };
        apply(u, data);
        return { count: 1 };
      },
    },
    role: { findUnique: async ({ where }) => Object.values(s.roles).find((r) => r.id === where.id) ?? null },
    rolePermission: {
      findFirst: async ({ where }) => (s.grants.has(`${where.roleId}|${where.permission.moduleKey}|${where.permission.actionKey}`) ? { roleId: where.roleId } : null),
      findMany: async ({ where }) => [...s.grants].filter((g) => g.startsWith(where.roleId)).map((g) => { const [, m, a] = g.split('|'); return { permission: { moduleKey: m, actionKey: a } }; }),
    },
    authSession: {
      create: async ({ data }) => { s.sessions.push({ ...data, revokedAt: null }); },
      findFirst: async ({ where }) => {
        const x = s.sessions.find((q) => q.id === where.id && q.userId === where.userId && q.tokenHash === where.tokenHash && !q.revokedAt && q.expiresAt > new Date());
        return x ? { id: x.id, user: s.users.find((u) => u.id === x.userId) } : null;
      },
      update: async () => ({}),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const q of s.sessions) {
          if (q.userId === (where.userId ?? q.userId) && (where.id === undefined || (where.id.not ? q.id !== where.id.not : q.id === where.id)) && !q.revokedAt) { Object.assign(q, data); count++; }
        }
        return { count };
      },
    },
    companySetting: { findUnique: async () => ({ maxLoginAttempts: 3 }) },
    auditEvent: { create: async ({ data }) => { s.audit.push(data); } },
  };
  return prisma;
}

async function boot(state) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService).useValue(makePrisma(state)).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { app, call };
}

async function main() {
  const s = await buildState();
  const { app, call } = await boot(s);
  const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });
  const admin = s.users[0], sales = s.users[1], victim = s.users[2];

  console.log('\n— Rutas protegidas sin sesión');
  check('GET /health es público', (await call('GET', '/health')).status === 200);
  check('GET /users sin token → 401', (await call('GET', '/users')).status === 401);
  check('POST /users sin token → 401 (antes cualquiera podía crear un admin)',
    (await call('POST', '/users', { body: { fullName: 'X', email: 'x@x.pe', password: '12345678', roleId: s.roles.admin.id } })).status === 401);
  check('GET /roles sin token → 401', (await call('GET', '/roles')).status === 401);
  check('GET /permissions sin token → 401', (await call('GET', '/permissions')).status === 401);

  console.log('\n— Login y sesión');
  const a = await login('admin@test.pe', 'AdminPass-12345');
  check('login admin → 200 con token', a.status === 200 && !!a.body.accessToken, JSON.stringify(a.body));
  check('login devuelve permisos del rol', a.body.permissions?.users?.length === 5);
  check('la respuesta no filtra passwordHash', !JSON.stringify(a.body).includes('passwordHash'));
  const adminToken = a.body.accessToken;
  const me = await call('GET', '/auth/me', { token: adminToken });
  check('GET /auth/me → 200 sin sessionId', me.status === 200 && !('sessionId' in me.body));
  const list = await call('GET', '/users', { token: adminToken });
  check('admin lista usuarios sin exponer passwordHash', list.status === 200 && !JSON.stringify(list.body).includes('passwordHash'));

  console.log('\n— Autorización por rol');
  const sl = await login('sales@test.pe', 'SalesPass-12345');
  check('usuario INVITED entra y queda ACTIVE', sl.status === 200 && sales.status === 'ACTIVE');
  const salesToken = sl.body.accessToken;
  check('Ventas GET /users → 403', (await call('GET', '/users', { token: salesToken })).status === 403);
  check('Ventas POST /users → 403', (await call('POST', '/users', { token: salesToken, body: { fullName: 'X', email: 'x@x.pe', password: '12345678', roleId: s.roles.sales.id } })).status === 403);
  s.grants.add(`${s.roles.sales.id}|users|create`);
  const esc = await call('POST', '/users', { token: salesToken, body: { fullName: 'Intruso', email: 'intruso@x.pe', password: '12345678', roleId: s.roles.admin.id } });
  check('con permiso users:create NO puede crear un Administrador (escalada) → 403', esc.status === 403, JSON.stringify(esc.body));
  const ok = await call('POST', '/users', { token: salesToken, body: { fullName: 'Nuevo', email: 'nuevo@x.pe', password: '12345678', roleId: s.roles.sales.id } });
  check('con permiso sí crea un usuario normal → 201 sin passwordHash', ok.status === 201 && !JSON.stringify(ok.body).includes('passwordHash'), JSON.stringify(ok.body));
  s.grants.add(`${s.roles.sales.id}|users|edit`);
  check('con users:edit NO puede modificar a un Administrador → 403',
    (await call('PATCH', `/users/${admin.id}/status`, { token: salesToken, body: { status: 'INACTIVE' } })).status === 403);
  check('admin no puede desactivarse a sí mismo → 403',
    (await call('PATCH', `/users/${admin.id}/status`, { token: adminToken, body: { status: 'INACTIVE' } })).status === 403);

  console.log('\n— Guard "denegar por defecto"');
  const guard = new PermissionsGuard(new Reflector(), { roleHasPermission: async () => true });
  const ctx = { getHandler: () => function noPolicy() {}, getClass: () => class NoPolicy {}, switchToHttp: () => ({ getRequest: () => ({ user: { role: { code: 'SALES' }, roleId: 'x' } }) }) };
  let denied = false; try { await guard.canActivate(ctx); } catch (e) { denied = e instanceof ForbiddenException; }
  check('ruta sin @RequirePermission ni @Public → 403', denied);

  console.log('\n— Bloqueo por intentos fallidos (máx. 3 en esta prueba)');
  for (let i = 1; i <= 3; i++) {
    const r = await login('victim@test.pe', 'incorrecta-123');
    check(`intento fallido ${i} → 401 genérico`, r.status === 401 && r.body.message === 'Invalid email or password');
  }
  check('la cuenta quedó LOCKED', victim.status === 'LOCKED');
  const lockedTry = await login('victim@test.pe', 'VictimPass-12345');
  check('contraseña correcta con cuenta bloqueada → 401 ACCOUNT_LOCKED', lockedTry.status === 401 && lockedTry.body.code === 'ACCOUNT_LOCKED', JSON.stringify(lockedTry.body));
  const unlock = await call('PATCH', `/users/${victim.id}/status`, { token: adminToken, body: { status: 'ACTIVE' } });
  check('admin desbloquea y se reinicia el contador', unlock.status === 200 && victim.failedLoginAttempts === 0);
  check('tras desbloquear puede entrar', (await login('victim@test.pe', 'VictimPass-12345')).status === 200);

  console.log('\n— Contraseñas y sesiones');
  const bad = await call('POST', '/auth/change-password', { token: adminToken, body: { currentPassword: 'mala-clave-1', newPassword: 'NuevaClave-12345' } });
  check('cambio con contraseña actual incorrecta → 400', bad.status === 400);
  const good = await call('POST', '/auth/change-password', { token: adminToken, body: { currentPassword: 'AdminPass-12345', newPassword: 'NuevaClave-12345' } });
  check('cambio correcto → 204', good.status === 204);
  check('la contraseña anterior ya no sirve', (await login('admin@test.pe', 'AdminPass-12345')).status === 401);
  const relog = await login('admin@test.pe', 'NuevaClave-12345');
  check('la nueva contraseña sí', relog.status === 200);
  const reset = await call('POST', `/users/${victim.id}/reset-password`, { token: relog.body.accessToken, body: { newPassword: 'Reset-Clave-12345' } });
  check('admin restablece la contraseña de otro usuario → 204', reset.status === 204);
  check('logout → 204', (await call('POST', '/auth/logout', { token: relog.body.accessToken })).status === 204);
  check('token revocado tras logout → 401', (await call('GET', '/auth/me', { token: relog.body.accessToken })).status === 401);

  console.log('\n— Auditoría');
  const has = (d, r) => s.audit.some((e) => e.description.includes(d) && (!r || e.result === r));
  check('registra ingresos exitosos', has('Inicio de sesión', 'SUCCESS'));
  check('registra ingresos fallidos', has('Inicio de sesión', 'FAILURE'));
  check('registra intentos con cuenta bloqueada como DENIED', has('cuenta no habilitada', 'DENIED'));
  check('registra cambios de usuarios con antes/después', s.audit.some((e) => e.moduleKey === 'users' && e.changes.length > 0));
  check('registra cierre de sesión', has('Cierre de sesión'));
  await app.close();

  console.log('\n— Límite de peticiones en login (app nueva)');
  const fresh = await boot(await buildState());
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await fresh.call('POST', '/auth/login', { body: { email: 'nadie@test.pe', password: 'cualquiera-123' } })).status);
  check('tras 10 intentos/min responde 429', codes.includes(429), codes.join(','));
  await fresh.app.close();

  console.log(failures ? `\n${failures} comprobación(es) FALLARON` : '\nTodas las comprobaciones pasaron');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
