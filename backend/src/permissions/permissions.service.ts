import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({
      select: { id: true, moduleKey: true, actionKey: true },
      orderBy: [{ moduleKey: 'asc' }, { actionKey: 'asc' }],
    });
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
        permission: {
          select: { id: true, moduleKey: true, actionKey: true },
        },
      },
      orderBy: [{ permissionId: 'asc' }],
    });

    return { role, permissions };
  }
}
