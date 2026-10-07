import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionsService } from '../../permissions/permissions.service';
import { ADMIN_ROLE_CODE } from '../../permissions/permissions.catalog';
import { ANY_AUTHENTICATED_KEY, REQUIRE_PERMISSION_KEY, type RequiredPermission } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Guard global de autorización, "denegar por defecto": una ruta no pública debe declarar
 * @RequirePermission(...) o @AnyAuthenticated(); si se olvida, responde 403.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRE_PERMISSION_KEY, targets);
    if (!required) throw new ForbiddenException('Route has no access policy');

    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('Insufficient permissions');
    if (user.role.code === ADMIN_ROLE_CODE) return true;

    const allowed = await this.permissions.roleHasPermission(user.roleId, required.module, required.action);
    if (!allowed) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
