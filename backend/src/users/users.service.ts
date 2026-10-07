import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators/request-meta.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ADMIN_ROLE_CODE } from '../permissions/permissions.catalog';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const publicUserSelect = {
  id: true,
  roleId: true,
  fullName: true,
  email: true,
  area: true,
  status: true,
  mfaEnabled: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      code: true,
      name: true,
      roleType: true,
      isActive: true,
    },
  },
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmail(normalizedEmail)) {
      throw new BadRequestException('A valid email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser, meta: RequestMeta) {
    const role = await this.requireAssignableRole(dto.roleId, actor);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    try {
      const created = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          area: dto.area?.trim() || null,
          role: { connect: { id: role.id } },
        },
        select: publicUserSelect,
      });
      await this.record(actor, meta, created, 'Crear', `Usuario creado · ${created.email}`, [
        ['Rol', '—', role.name],
      ]);
      return created;
    } catch (error) {
      this.handleUserWriteError(error);
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser, meta: RequestMeta) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    const before = await this.requireManageable(id, actor);

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.area !== undefined) data.area = dto.area?.trim() || null;

    try {
      const updated = await this.prisma.user.update({ where: { id }, data, select: publicUserSelect });
      const changes = this.diff(before, updated);
      if (changes.length) await this.record(actor, meta, updated, 'Editar', `Usuario actualizado · ${updated.email}`, changes);
      return updated;
    } catch (error) {
      this.handleUserWriteError(error);
    }
  }

  async setStatus(id: string, status: UserStatus, actor: AuthenticatedUser, meta: RequestMeta) {
    if (id === actor.id) throw new ForbiddenException('You cannot change the status of your own account');
    const before = await this.requireManageable(id, actor);

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        // Reactivar una cuenta bloqueada también limpia el contador de intentos.
        data: status === UserStatus.ACTIVE ? { status, failedLoginAttempts: 0, lockedUntil: null } : { status },
        select: publicUserSelect,
      });
      await this.record(actor, meta, updated, 'Editar', `Estado de usuario: ${updated.email}`, [
        ['Estado', before.status, updated.status],
      ]);
      return updated;
    } catch (error) {
      this.handleUserWriteError(error);
    }
  }

  async assignRole(id: string, roleId: string, actor: AuthenticatedUser, meta: RequestMeta) {
    if (id === actor.id) throw new ForbiddenException('You cannot change the role of your own account');
    const before = await this.requireManageable(id, actor);
    const role = await this.requireAssignableRole(roleId, actor);

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { role: { connect: { id: role.id } } },
        select: publicUserSelect,
      });
      await this.record(actor, meta, updated, 'Editar', `Rol de usuario: ${updated.email}`, [
        ['Rol', before.role.name, role.name],
      ]);
      return updated;
    } catch (error) {
      this.handleUserWriteError(error);
    }
  }

  async resetPassword(id: string, newPassword: string, actor: AuthenticatedUser, meta: RequestMeta): Promise<void> {
    if (id === actor.id) throw new BadRequestException('Use POST /auth/change-password for your own account');
    const target = await this.requireManageable(id, actor);

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.record(actor, meta, target, 'Editar', `Contraseña restablecida · ${target.email}`, []);
  }

  /** El rol existe y está activo; solo un Administrador puede asignar el rol Administrador. */
  private async requireAssignableRole(roleId: string, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (!role.isActive) throw new BadRequestException('Role is inactive');
    if (role.code === ADMIN_ROLE_CODE && actor.role.code !== ADMIN_ROLE_CODE) {
      throw new ForbiddenException('Only administrators can assign the administrator role');
    }
    return role;
  }

  /** El usuario existe y el actor puede gestionarlo (solo un Administrador gestiona a otro). */
  private async requireManageable(id: string, actor: AuthenticatedUser): Promise<PublicUser> {
    const target = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!target) throw new NotFoundException('User not found');
    if (target.role.code === ADMIN_ROLE_CODE && actor.role.code !== ADMIN_ROLE_CODE) {
      throw new ForbiddenException('Only administrators can manage administrator accounts');
    }
    return target;
  }

  private diff(before: PublicUser, after: PublicUser): [string, string, string][] {
    const out: [string, string, string][] = [];
    if (before.fullName !== after.fullName) out.push(['Nombre', before.fullName, after.fullName]);
    if (before.email !== after.email) out.push(['Correo', before.email, after.email]);
    if ((before.area ?? '') !== (after.area ?? '')) out.push(['Área', before.area ?? '—', after.area ?? '—']);
    return out;
  }

  private record(
    actor: AuthenticatedUser,
    meta: RequestMeta,
    target: Pick<PublicUser, 'id' | 'email'>,
    action: 'Crear' | 'Editar',
    description: string,
    changes: [string, string, string][],
  ) {
    return this.audit.record({
      userId: actor.id, roleId: actor.roleId, userName: actor.fullName, roleName: actor.role.name,
      action: action === 'Crear' ? AuditAction.CREATE : AuditAction.EDIT,
      moduleKey: 'users', entityType: 'User', entityId: target.id, reference: target.email,
      description, changes, ip: meta.ip, device: meta.userAgent,
    });
  }

  private handleUserWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
    }
    throw error;
  }
}
