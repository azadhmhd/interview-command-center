import { Body, Controller, Delete, Get, HttpCode, Post, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { verifyPassword } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, Public, SESSION_COOKIE, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { QueueService } from '../tasks/queue.service';

const deleteSchema = z.object({ password: z.string(), confirm: z.literal('DELETE') });

@ApiTags('account')
@Controller()
export class AccountController {
  constructor(private prisma: PrismaService, private audit: AuditService, private queue: QueueService) {}

  @Public() @Get('health')
  async health() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redis = await this.queue.ping().catch(() => false);
    return { ok: db, db, redis, time: new Date().toISOString() };
  }

  /** Everything in workspaces the user owns. Secrets (password hash, API keys, storage paths) are excluded. */
  @Get('account/export')
  async export(@CurrentCtx() ctx: Ctx, @Res({ passthrough: true }) res: Response) {
    const owned = await this.prisma.workspaceMembership.findMany({ where: { userId: ctx.userId, role: 'OWNER' }, select: { workspaceId: true } });
    const ids = owned.map((o) => o.workspaceId);
    const w = { workspaceId: { in: ids } };
    const omitPath = { storagePath: true } as const;
    const data = {
      exportedAt: new Date().toISOString(),
      user: await this.prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, email: true, name: true, createdAt: true } }),
      workspaces: await this.prisma.workspace.findMany({ where: { id: { in: ids } } }),
      profiles: await this.prisma.candidateProfile.findMany({ where: w }),
      resumes: await this.prisma.resumeDocument.findMany({ where: w, omit: omitPath }),
      applications: await this.prisma.application.findMany({ where: w, include: { contacts: true, activities: true } }),
      rounds: await this.prisma.interviewRound.findMany({ where: w }),
      questions: await this.prisma.interviewQuestionOccurrence.findMany({ where: w }),
      canonicalQuestions: await this.prisma.canonicalQuestion.findMany({ where: w }),
      attempts: await this.prisma.answerAttempt.findMany({ where: w, include: { evaluation: true } }),
      courses: await this.prisma.preparationCourse.findMany({ where: w, include: { lessons: true } }),
      sessions: await this.prisma.practiceSession.findMany({ where: w }),
      reminders: await this.prisma.reminder.findMany({ where: w }),
      research: await this.prisma.researchSource.findMany({ where: w }),
      attachments: await this.prisma.attachment.findMany({ where: w, omit: omitPath }),
      tasks: await this.prisma.agentTask.findMany({ where: w, include: { history: true } }),
    };
    await this.audit.record(ctx, 'account.export');
    res.setHeader('Content-Disposition', `attachment; filename="icc-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return data;
  }

  /** Permanently deletes the user, every workspace they own (with all records and files), and their sessions. */
  @Delete('account') @HttpCode(200) @ApiZod(deleteSchema)
  async remove(@CurrentCtx() ctx: Ctx, @Body(zp(deleteSchema)) body: z.infer<typeof deleteSchema>, @Res({ passthrough: true }) res: Response) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await verifyPassword(body.password, user.passwordHash))) throw new UnauthorizedException('Password is incorrect');
    const owned = await this.prisma.workspaceMembership.findMany({ where: { userId: ctx.userId, role: 'OWNER' }, select: { workspaceId: true } });
    const ids = owned.map((o) => o.workspaceId);
    await this.prisma.$transaction([
      this.prisma.recordShare.deleteMany({ where: { OR: [{ workspaceId: { in: ids } }, { granteeId: ctx.userId }] } }),
      this.prisma.workspace.deleteMany({ where: { id: { in: ids } } }),
      this.prisma.user.delete({ where: { id: ctx.userId } }),
    ]);
    for (const id of ids) {
      if (!/^[a-z0-9]+$/.test(id)) throw new BadRequestException();
      await rm(join(config.uploadDir, id), { recursive: true, force: true });
    }
    await this.audit.record({ ip: ctx.ip }, 'account.deleted', { type: 'user', id: ctx.userId });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('account/sessions/revoke-others') @HttpCode(200)
  async revokeOthers(@CurrentCtx() ctx: Ctx) {
    const sessions = await this.prisma.session.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: 'desc' } });
    // ponytail: keeps the newest session (normally the caller); exact matching would need the token in ctx
    await this.prisma.session.deleteMany({ where: { userId: ctx.userId, id: { in: sessions.slice(1).map((s) => s.id) } } });
    return { revoked: Math.max(0, sessions.length - 1) };
  }
}
