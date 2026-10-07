import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, AuditResult, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  roleId?: string | null;
  userName: string;
  roleName?: string | null;
  action: AuditAction;
  moduleKey: string;
  entityType?: string;
  entityId?: string;
  reference?: string;
  description: string;
  result?: AuditResult;
  /** Cambios campo a campo: [campo, antes, después] */
  changes?: [field: string, before: string, after: string][];
  detail?: string;
  ip?: string | null;
  device?: string | null;
}

/** Registra eventos de auditoría. Un fallo al auditar no debe tumbar la operación principal. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          userId: entry.userId ?? null,
          roleId: entry.roleId ?? null,
          userNameSnapshot: entry.userName,
          roleNameSnapshot: entry.roleName ?? null,
          action: entry.action,
          moduleKey: entry.moduleKey,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          referenceSnapshot: entry.reference ?? null,
          description: entry.description,
          result: entry.result ?? AuditResult.SUCCESS,
          changes: (entry.changes ?? []) as Prisma.InputJsonValue,
          detail: entry.detail ?? null,
          ip: entry.ip ?? null,
          device: entry.device ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`No se pudo registrar el evento de auditoría: ${entry.description}`, error as Error);
    }
  }
}
