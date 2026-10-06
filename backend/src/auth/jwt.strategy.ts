import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  authenticatedSessionUserSelect,
  type AuthenticatedUser,
  type JwtPayload,
} from './interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!token || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const now = new Date();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        user: { select: authenticatedSessionUserSelect },
      },
    });

    if (
      !session ||
      session.user.status !== UserStatus.ACTIVE ||
      !session.user.role.isActive ||
      (session.user.lockedUntil !== null && session.user.lockedUntil > now)
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });

    const { lockedUntil, ...safeUser } = session.user;
    return { ...safeUser, sessionId: session.id };
  }
}