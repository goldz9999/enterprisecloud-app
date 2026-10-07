import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '../../permissions/permissions.catalog';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const ANY_AUTHENTICATED_KEY = 'anyAuthenticated';

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

/** La ruta exige que el rol del usuario tenga `action` sobre `module`. */
export const RequirePermission = (module: string, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { module, action } satisfies RequiredPermission);

/** Ruta para cualquier usuario autenticado, sin permiso específico (p. ej. /auth/me). */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);
