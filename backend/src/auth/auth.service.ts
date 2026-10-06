import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  authenticatedUserSelect,
  type AuthenticatedUser,
  type LoginRequestMetadata,
  type LoginResponse,
} from './interfaces/authenticated-user.interface';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    if (!user?.passwordHash) throw invalidCredentials();

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      passwordMatches = false;
    }

    const now = new Date();
    if (
      !passwordMatches ||
      user.status !== UserStatus.ACTIVE ||
      !user.role.isActive ||
      (user.lockedUntil !== null && user.lockedUntil > now)
    ) {
      throw invalidCredentials();
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
      const updated = await transaction.user.updateMany({
        where: {
          id: user.id,
          status: UserStatus.ACTIVE,
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: {
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

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: safeUser,
    };
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        id: user.sessionId,
        userId: user.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  me(user: AuthenticatedUser) {
    const { sessionId, ...safeUser } = user;
    return safeUser;
  }
}