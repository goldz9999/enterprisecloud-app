import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ROLE_CODE,
  ALL_MODULE_KEYS,
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  type PermissionAction,
} from './permissions.catalog';

/** módulo → acciones concedidas, p. ej. { customers: ['view', 'create'] } */
export type PermissionMap = Record<string, PermissionAction[]>;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({
      select: { id: true, moduleKey: true, actionKey: true },
      orderBy: [{ moduleKey: 'asc' }, { actionKey: 'asc' }],
    });
  }

  /** Módulos agrupados con su etiqueta, tal como los muestra la pantalla de Permisos. */
  catalog() {
    return { actions: PERMISSION_ACTIONS, groups: PERMISSION_GROUPS };
  }

  async findForRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, code: true, name: true },
    });
    if (!role) throw new NotFoundException('Role not found');

    const permissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: {
        granted: true,
        updatedAt: true,
        permission: { select: { id: true, moduleKey: true, actionKey: true } },
      },
      orderBy: [{ permissionId: 'asc' }],
    });

    return { role, permissions };
  }

  async roleHasPermission(roleId: string, moduleKey: string, actionKey: string): Promise<boolean> {
    const grant = await this.prisma.rolePermission.findFirst({
      where: { roleId, granted: true, permission: { moduleKey, actionKey } },
      select: { roleId: true },
    });
    return grant !== null;
  }

  /** Permisos efectivos de un rol, para que el frontend decida qué mostrar. */
  async mapForRole(roleId: string, roleCode: string): Promise<PermissionMap> {
    if (roleCode === ADMIN_ROLE_CODE) {
      return Object.fromEntries(ALL_MODULE_KEYS.map((m) => [m, [...PERMISSION_ACTIONS]]));
    }
    const grants = await this.prisma.rolePermission.findMany({
      where: { roleId, granted: true },
      select: { permission: { select: { moduleKey: true, actionKey: true } } },
    });
    const map: PermissionMap = {};
    for (const { permission } of grants) {
      (map[permission.moduleKey] ??= []).push(permission.actionKey as PermissionAction);
    }
    return map;
  }
}
