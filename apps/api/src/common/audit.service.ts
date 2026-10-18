import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { Ctx } from './http';

@Injectable()
export class AuditService {
  private log = new Logger('Audit');
  constructor(private prisma: PrismaService) {}

  async record(
    ctx: Partial<Ctx> | null,
    action: string,
    resource?: { type: string; id: string },
    data?: Record<string, unknown>,
  ) {
    // Never put secrets in `data`.
    await this.prisma.auditEvent.create({
      data: {
        action, userId: ctx?.userId, workspaceId: ctx?.workspaceId, ip: ctx?.ip,
        resourceType: resource?.type, resourceId: resource?.id, data: data as Prisma.InputJsonValue,
      },
    });
    this.log.log(JSON.stringify({ action, userId: ctx?.userId, resource }));
  }
}
