import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShareResource, SharePermission } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { PrismaService } from '../prisma.service';

const shareSchema = z.object({
  resourceType: z.enum(['APPLICATION', 'COURSE']),
  resourceId: z.string().min(1),
  email: z.string().email().transform((s) => s.toLowerCase()),
  permission: z.enum(['VIEW', 'EDIT']).default('VIEW'),
});
const noteSchema = z.object({ message: z.string().min(1).max(5000) });
const lessonEditSchema = z.object({ explanation: z.string().max(50000).optional(), examples: z.string().max(50000).optional() });

@ApiTags('sharing')
@Controller()
export class SharesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── owner side (scoped to the caller's current workspace) ──

  @Post('shares') @ApiZod(shareSchema)
  async share(@CurrentCtx() ctx: Ctx, @Body(zp(shareSchema)) body: z.infer<typeof shareSchema>) {
    const owned = body.resourceType === 'APPLICATION'
      ? await this.prisma.application.count({ where: { id: body.resourceId, workspaceId: ctx.workspaceId } })
      : await this.prisma.preparationCourse.count({ where: { id: body.resourceId, workspaceId: ctx.workspaceId } });
    if (!owned) throw new NotFoundException('Record not found');
    const grantee = await this.prisma.user.findUnique({ where: { email: body.email } });
    // ponytail: grantee must already have an account; pending shares for unknown emails can come later
    if (!grantee) throw new BadRequestException('No user with that email. Ask them to register first.');
    if (grantee.id === ctx.userId) throw new BadRequestException('You cannot share with yourself');
    const share = await this.prisma.recordShare.upsert({
      where: { resourceType_resourceId_granteeId: { resourceType: body.resourceType, resourceId: body.resourceId, granteeId: grantee.id } },
      create: { workspaceId: ctx.workspaceId, resourceType: body.resourceType, resourceId: body.resourceId, granteeId: grantee.id, permission: body.permission, createdById: ctx.userId },
      update: { permission: body.permission, revokedAt: null },
    });
    await this.audit.record(ctx, 'share.grant', { type: body.resourceType, id: body.resourceId }, { grantee: body.email, permission: body.permission });
    return share;
  }

  @Get('shares')
  list(@CurrentCtx() ctx: Ctx, @Query('resourceType') resourceType?: ShareResource, @Query('resourceId') resourceId?: string) {
    return this.prisma.recordShare.findMany({
      where: { workspaceId: ctx.workspaceId, revokedAt: null, ...(resourceType && { resourceType }), ...(resourceId && { resourceId }) },
      include: { grantee: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('shares/:id')
  async revoke(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.recordShare.updateMany({ where: { id, workspaceId: ctx.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new NotFoundException();
    await this.audit.record(ctx, 'share.revoke', { type: 'share', id });
    return { ok: true };
  }

  // ── grantee side (independent of workspace; access only via an active share row) ──

  private async grant(ctx: Ctx, resourceType: ShareResource, resourceId: string, need: SharePermission = 'VIEW') {
    const s = await this.prisma.recordShare.findFirst({ where: { resourceType, resourceId, granteeId: ctx.userId, revokedAt: null } });
    if (!s) throw new NotFoundException('Not found');
    if (need === 'EDIT' && s.permission !== 'EDIT') throw new ForbiddenException('View-only share');
    return s;
  }

  @Get('shared')
  async sharedWithMe(@CurrentCtx() ctx: Ctx) {
    const shares = await this.prisma.recordShare.findMany({ where: { granteeId: ctx.userId, revokedAt: null } });
    const apps = await this.prisma.application.findMany({ where: { id: { in: shares.filter((s) => s.resourceType === 'APPLICATION').map((s) => s.resourceId) } }, select: { id: true, companyName: true, jobTitle: true, status: true } });
    const courses = await this.prisma.preparationCourse.findMany({ where: { id: { in: shares.filter((s) => s.resourceType === 'COURSE').map((s) => s.resourceId) } }, select: { id: true, title: true, mode: true } });
    return shares.map((s) => ({
      shareId: s.id, resourceType: s.resourceType, resourceId: s.resourceId, permission: s.permission,
      record: s.resourceType === 'APPLICATION' ? apps.find((a) => a.id === s.resourceId) : courses.find((c) => c.id === s.resourceId),
    }));
  }

  @Get('shared/applications/:id')
  async sharedApplication(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const s = await this.grant(ctx, 'APPLICATION', id);
    const app = await this.prisma.application.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, companyName: true, jobTitle: true, location: true, status: true, jobDescription: true,
        rounds: { orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, type: true, title: true, scheduledAt: true, status: true, outcome: true, feedback: true,
          occurrences: { select: { id: true, source: true, prompt: true, originalAnswer: true, improvedAnswer: true, approvedAnswer: true, mistakes: true, conceptsMissed: true } } } },
        activities: { where: { type: 'note' }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, message: true, createdAt: true, actorId: true } },
      },
    });
    return { permission: s.permission, application: app };
  }

  @Post('shared/applications/:id/notes') @ApiZod(noteSchema)
  async sharedNote(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(noteSchema)) body: { message: string }) {
    const s = await this.grant(ctx, 'APPLICATION', id, 'EDIT');
    return this.prisma.applicationActivity.create({
      data: { workspaceId: s.workspaceId, applicationId: id, type: 'note', message: `${ctx.name}: ${body.message}`, actorId: ctx.userId },
    });
  }

  /** A shared course exposes ONLY the course and lessons — never the source application, rounds or answers. */
  @Get('shared/courses/:id')
  async sharedCourse(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const s = await this.grant(ctx, 'COURSE', id);
    const course = await this.prisma.preparationCourse.findUniqueOrThrow({
      where: { id },
      select: { id: true, title: true, mode: true, overview: true, lessons: { orderBy: { order: 'asc' }, select: { id: true, key: true, order: true, kind: true, title: true, objectives: true, estimatedMinutes: true, explanation: true, examples: true, questions: true, evaluationCriteria: true, commonMistakes: true } } },
    });
    const overview = { ...(course.overview as Record<string, unknown>) };
    delete overview.context; // personal context never leaves the owner's workspace
    return { permission: s.permission, course: { ...course, overview } };
  }

  @Patch('shared/courses/:id/lessons/:lessonId') @ApiZod(lessonEditSchema)
  async editSharedLesson(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('lessonId') lessonId: string, @Body(zp(lessonEditSchema)) body: z.infer<typeof lessonEditSchema>) {
    await this.grant(ctx, 'COURSE', id, 'EDIT');
    const r = await this.prisma.preparationModule.updateMany({ where: { id: lessonId, courseId: id }, data: { ...body, version: { increment: 1 } } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }
}
