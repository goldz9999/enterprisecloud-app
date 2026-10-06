import { Prisma } from '@prisma/client';

export const authenticatedUserSelect = {
  id: true,
  roleId: true,
  fullName: true,
  email: true,
  area: true,
  status: true,
  lastLoginAt: true,
  role: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
} satisfies Prisma.UserSelect;

export const authenticatedSessionUserSelect = {
  ...authenticatedUserSelect,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

export type SafeAuthUser = Prisma.UserGetPayload<{
  select: typeof authenticatedUserSelect;
}>;

export interface AuthenticatedUser extends SafeAuthUser {
  sessionId: string;
}

export interface JwtPayload {
  sub: string;
  sid: string;
  iat?: number;
  exp?: number;
}

export interface LoginRequestMetadata {
  ip: string | null;
  userAgent: string | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: SafeAuthUser;
}