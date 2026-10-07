import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { AuditAction, AuditResult, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import {
  authenticatedUserSelect,
  type AuthenticatedUser,
  type LoginRequestMetadata,
  type LoginResponse,
} from './interfaces/authenticated-user.interface';

const DEFAULT_MAX_ATTEMPTS = 5;

const invalidCredentials = () =>
  new UnauthorizedException('Invalid email or password');

const secondsForDuration = (duration: string): number => {
  const match = /^([1-9]\d*)([smhd])$/.exec(duration);
  if (!match) throw new Error('Invalid JWT_EXPIRES_IN configuration');
  const amount = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * multiplier;
};

@Injectable()
export class AuthService {
  private readonly jwtExpiresIn: string;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
    config: ConfigService,
  ) {
    this.jwtExpiresIn = config.getOrThrow<string>('JWT_EXPIRES_IN');
  }

  async login(
    dto: LoginDto,
    metadata: LoginRequestMetadata,
  ): Promise<LoginResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        ...authenticatedUserSelect,
        passwordHash: true,
        lockedUntil: true,
      },
    });

    // Se verifica siempre una contraseña (real o falsa) para que el tiempo de respuesta
    // no revele si el correo existe.
    const passwordMatches = await this.verify(user?.passwordHash ?? (await this.getDummyHash()), dto.password);
    const device = metadata.userAgent;

    if (!user?.passwordHash) {
      await this.audit.record({
        userName: email, action: AuditAction.LOGIN, moduleKey: 'security', reference: email,
        description: 'Inicio de sesión con correo no registrado', result: AuditResult.FAILURE,
        ip: metadata.ip, device,
      });
      throw invalidCredentials();
    }

    const actor = { userId: user.id, roleId: user.roleId, userName: user.fullName, roleName: user.role.name };
    const canAttempt = user.status === UserStatus.ACTIVE || user.status === UserStatus.INVITED;

    if (!passwordMatches) {
      const locked = canAttempt ? await this.registerFailedAttempt(user.id) : false;
      await this.audit.record({
        ...actor, action: AuditAction.LOGIN, moduleKey: 'security', entityType: 'User', entityId: user.id,
        reference: email, description: 'Inicio de sesión', result: AuditResult.FAILURE,
        detail: locked ? 'Cuenta bloqueada por exceder los intentos fallidos.' : 'Contraseña incorrecta.',
        ip: metadata.ip, device,
      });
      throw invalidCredentials();
    }

    // Contraseña correcta: ahora sí se informa el motivo si la cuenta no puede entrar.
    const now = new Date();
    const denial = this.denialFor(user.status, user.role.isActive, user.lockedUntil, now);
    if (denial) {
      await this.audit.record({
        ...actor, action: AuditAction.LOGIN, moduleKey: 'security', entityType: 'User', entityId: user.id,
        reference: email, description: 'Intento de ingreso con cuenta no habilitada', result: AuditResult.DENIED,
        detail: denial.message, ip: metadata.ip, device,
      });
      throw new UnauthorizedException({ message: denial.message, code: denial.code });
    }

    const sessionId = randomUUID();
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, sid: sessionId },
      { expiresIn: this.jwtExpiresIn as JwtSignOptions['expiresIn'] },
    );
    const expiresAt = new Date(
      now.getTime() + secondsForDuration(this.jwtExpiresIn) * 1000,
    );
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');

    const safeUser = await this.prisma.$transaction(async (transaction) => {
      // Una invitación pendiente se confirma con el primer ingreso exitoso.
      const updated = await transaction.user.updateMany({
        where: {
          id: user.id,
          status: { in: [UserStatus.ACTIVE, UserStatus.INVITED] },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: {
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });
      if (updated.count !== 1) throw invalidCredentials();

      await transaction.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash,
          persistent: true,
          expiresAt,
          ip: metadata.ip,
          userAgent: metadata.userAgent,
        },
      });

      return transaction.user.findUniqueOrThrow({
        where: { id: user.id },
        select: authenticatedUserSelect,
      });
    });

    await this.audit.record({
      ...actor, action: AuditAction.LOGIN, moduleKey: 'security', entityType: 'User', entityId: user.id,
      reference: email, description: 'Inicio de sesión', ip: metadata.ip, device,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: safeUser,
      permissions: await this.permissions.mapForRole(safeUser.roleId, safeUser.role.code),
    };
  }

  async logout(user: AuthenticatedUser, metadata: LoginRequestMetadata): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: user.sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      userId: user.id, roleId: user.roleId, userName: user.fullName, roleName: user.role.name,
      action: AuditAction.LOGIN, moduleKey: 'security', entityType: 'User', entityId: user.id,
      reference: user.email, description: 'Cierre de sesión', ip: metadata.ip, device: metadata.userAgent,
    });
  }

  async me(user: AuthenticatedUser) {
    const { sessionId, ...safeUser } = user;
    return { ...safeUser, permissions: await this.permissions.mapForRole(user.roleId, user.role.code) };
  }

  /** Cambia la contraseña propia y cierra las demás sesiones abiertas. */
  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto, metadata: LoginRequestMetadata): Promise<void> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row?.passwordHash || !(await this.verify(row.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      userId: user.id, roleId: user.roleId, userName: user.fullName, roleName: user.role.name,
      action: AuditAction.EDIT, moduleKey: 'security', entityType: 'User', entityId: user.id,
      reference: user.email, description: 'Cambio de contraseña', ip: metadata.ip, device: metadata.userAgent,
    });
  }

  private async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomUUID(), { type: argon2.argon2id });
    return this.dummyHash;
  }

  private denialFor(status: UserStatus, roleActive: boolean, lockedUntil: Date | null, now: Date) {
    if (status === UserStatus.LOCKED || (lockedUntil !== null && lockedUntil > now)) {
      return { code: 'ACCOUNT_LOCKED', message: 'Account locked. Ask an administrator to unlock it.' };
    }
    if (status === UserStatus.INACTIVE || !roleActive) {
      return { code: 'ACCOUNT_INACTIVE', message: 'Account inactive. Contact an administrator.' };
    }
    return null;
  }

  /** Suma un intento fallido; al llegar al máximo configurado bloquea la cuenta. Devuelve si quedó bloqueada. */
  private async registerFailedAttempt(userId: string): Promise<boolean> {
    const settings = await this.prisma.companySetting.findUnique({
      where: { id: 1 },
      select: { maxLoginAttempts: true },
    });
    const max = settings?.maxLoginAttempts ?? DEFAULT_MAX_ATTEMPTS;

    const { failedLoginAttempts } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts < max) return false;

    await this.prisma.user.updateMany({
      where: { id: userId, status: { in: [UserStatus.ACTIVE, UserStatus.INVITED] } },
      data: { status: UserStatus.LOCKED },
    });
    return true;
  }
}
