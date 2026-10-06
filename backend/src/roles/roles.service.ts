import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  roleType: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      select: roleSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: roleSelect,
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }
}
