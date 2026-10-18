import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Prisma, Priority } from '@prisma/client';
import type { Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { newToken } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, optDate, optInt, optStr, zp } from '../common/http';
import { readSettings } from '../common/workspace-settings';
import { PrismaService } from '../prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { WorkspaceAccess } from '../workspaces/workspaces';
import { UnsafeUrlError } from '../llm/url-guard';
import { fetchPage, parseJobPage } from './job-import';

export const dedupeKey = (company: string, title: string) =>
  `${company.toLowerCase().replace(/\b(inc|llc|ltd|fz|fze|fzco|dmcc|gmbh|plc)\b\.?/g, '').replace(/[^a-z0-9]+/g, '')}|${title.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

const url = () => z.string().url().max(2000).optional().nullable().or(z.literal('').transform(() => null));

const appSchema = z.object({
  companyName: z.string().min(1).max(200), companyWebsite: url(), location: optStr(200), companyNotes: optStr(),
  jobTitle: z.string().min(1).max(200), seniority: optStr(60), jobDescription: optStr(100000), jobUrl: url(), source: optStr(100),
  appliedAt: optDate(), resumeId: z.string().optional().nullable(), coverLetter: optStr(50000), salaryExpectation: optInt(),
  salaryCurrency: z.string().max(5).optional(), benefits: optStr(), noticePeriodDays: optInt(), status: z.string().max(60).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(), nextAction: optStr(500), nextActionAt: optDate(),
  offerDetails: optStr(), rejectionReason: optStr(), withdrawalReason: optStr(), archived: z.boolean().optional(),
});
const createSchema = appSchema.extend({ force: z.boolean().optional() });
const activitySchema = z.object({ type: z.enum(['note', 'communication']).default('note'), message: z.string().min(1).max(20000) });
const contactSchema = z.object({
  name: z.string().min(1).max(200), role: z.enum(['recruiter', 'hiring_manager', 'interviewer', 'other']).default('recruiter'),
  email: z.string().email().optional().nullable().or(z.literal('').transform(() => null)), phone: optStr(50), linkedin: optStr(500), notes: optStr(),
});
const importSchema = z.object({ url: z.string().url().max(2000) });
const linkSchema = z.object({ label: z.string().min(1).max(200), url: z.string().url().max(2000), roundId: z.string().optional() });

const ATTACH_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/webp'];

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private prisma: PrismaService, private access: WorkspaceAccess, private scheduler: SchedulerService) {}

  @Get()
  async list(
    @CurrentCtx() ctx: Ctx, @Query('q') q?: string, @Query('status') status?: string, @Query('priority') priority?: string,
    @Query('from') from?: string, @Query('to') to?: string, @Query('roundType') roundType?: string, @Query('archived') archived?: string,
    @Query('prep') prep?: string,
  ) {
    const where: Prisma.ApplicationWhereInput = {
      workspaceId: ctx.workspaceId,
      archived: archived === 'true',
      ...(status && { status: { in: status.split(',') } }),
      ...(priority && { priority: priority as Priority }),
      ...(q && { OR: [{ companyName: { contains: q, mode: 'insensitive' } }, { jobTitle: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }] }),
      ...((from || to) && { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
      ...(roundType && { rounds: { some: { type: roundType } } }),
      ...(prep === 'with_course' && { courses: { some: {} } }),
      ...(prep === 'no_course' && { courses: { none: {} }, rounds: { some: { scheduledAt: { gte: new Date() } } } }),
    };
    const apps = await this.prisma.application.findMany({
      where, orderBy: [{ updatedAt: 'desc' }], take: 500,
      include: {
        rounds: { orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, type: true, title: true, scheduledAt: true, status: true, outcome: true } },
        _count: { select: { occurrences: true, courses: true } },
      },
    });
    const now = Date.now();
    return apps.map(({ jobDescription: _jd, coverLetter: _cl, ...a }) => ({
      ...a,
      nextRound: a.rounds.find((r) => r.scheduledAt && r.scheduledAt.getTime() > now && r.status !== 'cancelled') ?? null,
    }));
  }

  @Get('duplicates')
  async duplicates(@CurrentCtx() ctx: Ctx, @Query('company') company = '', @Query('title') title = '') {
    if (!company || !title) return [];
    return this.prisma.application.findMany({
      where: { workspaceId: ctx.workspaceId, dedupeKey: dedupeKey(company, title) },
      select: { id: true, companyName: true, jobTitle: true, status: true, createdAt: true },
    });
  }

  /** Pre-fill the form from a job post URL. Read-only: nothing is saved. */
  @Post('import') @ApiZod(importSchema)
  async importUrl(@Body(zp(importSchema)) body: z.infer<typeof importSchema>) {
    try {
      const page = await fetchPage(body.url);
      return parseJobPage(page.html, body.url);
    } catch (e) {
      const why = e instanceof UnsafeUrlError ? 'only public http(s) job pages can be fetched' : (e as Error).message;
      throw new BadRequestException(`Could not read that page: ${why}. Paste the job description manually.`);
    }
  }

  @Post() @ApiZod(createSchema)
  async create(@CurrentCtx() ctx: Ctx, @Body(zp(createSchema)) body: z.infer<typeof createSchema>) {
    const { force, ...data } = body;
    const key = dedupeKey(data.companyName, data.jobTitle);
    if (!force) {
      const dups = await this.prisma.application.findMany({ where: { workspaceId: ctx.workspaceId, dedupeKey: key }, select: { id: true, companyName: true, jobTitle: true, status: true, createdAt: true } });
      if (dups.length) throw new ConflictException({ message: 'An application for this company and role already exists', duplicates: dups });
    }
    await this.checkStatus(ctx, data.status);
    if (data.resumeId) await this.checkResume(ctx, data.resumeId);
    const app = await this.prisma.application.create({
      data: {
        ...data, workspaceId: ctx.workspaceId, dedupeKey: key,
        ...(data.status === 'Applied' && !data.appliedAt && { appliedAt: new Date() }),
        activities: { create: { workspaceId: ctx.workspaceId, type: 'created', message: `Application created (${data.status ?? 'Saved'})`, actorId: ctx.userId } },
      },
    });
    if (app.status === 'Applied') await this.scheduler.planFollowUp(app);
    return app;
  }

  @Get(':id')
  async get(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.access.application(ctx, id);
    return this.prisma.application.findUniqueOrThrow({
      where: { id },
      include: {
        resume: { select: { id: true, label: true, version: true, fileName: true } },
        contacts: { orderBy: { createdAt: 'asc' } },
        rounds: { orderBy: { sequence: 'asc' }, include: { _count: { select: { occurrences: true } } } },
        activities: { orderBy: { createdAt: 'desc' }, take: 200 },
        attachments: { orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, label: true, fileName: true, mimeType: true, sizeBytes: true, url: true, roundId: true, createdAt: true } },
        courses: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, mode: true, roundId: true, createdAt: true, generator: true } },
        reminders: { where: { status: { in: ['pending', 'fired'] } }, orderBy: { dueAt: 'asc' } },
        research: { orderBy: { retrievedAt: 'desc' } },
      },
    });
  }

  @Patch(':id') @ApiZod(appSchema.partial())
  async update(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(appSchema.partial())) body: Partial<z.infer<typeof appSchema>>) {
    const before = await this.access.application(ctx, id);
    await this.checkStatus(ctx, body.status);
    if (body.resumeId) await this.checkResume(ctx, body.resumeId);
    const statusChanged = body.status && body.status !== before.status;
    const app = await this.prisma.application.update({
      where: { id },
      data: {
        ...body,
        ...((body.companyName || body.jobTitle) && { dedupeKey: dedupeKey(body.companyName ?? before.companyName, body.jobTitle ?? before.jobTitle) }),
        ...(statusChanged && body.status === 'Applied' && !before.appliedAt && !body.appliedAt && { appliedAt: new Date() }),
      },
    });
    if (statusChanged) {
      await this.prisma.applicationActivity.create({
        data: { workspaceId: ctx.workspaceId, applicationId: id, type: 'status_change', message: `Status: ${before.status} → ${body.status}`, data: { from: before.status, to: body.status }, actorId: ctx.userId },
      });
      if (body.status === 'Applied') await this.scheduler.planFollowUp(app);
      if (['Rejected', 'Withdrawn', 'Offer'].includes(body.status!)) await this.scheduler.closeApplication(app.id);
    }
    return app;
  }

  @Delete(':id')
  async remove(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.access.application(ctx, id);
    await this.prisma.application.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/activities') @ApiZod(activitySchema)
  async addActivity(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(activitySchema)) body: z.infer<typeof activitySchema>) {
    await this.access.application(ctx, id);
    return this.prisma.applicationActivity.create({ data: { workspaceId: ctx.workspaceId, applicationId: id, type: body.type, message: body.message, actorId: ctx.userId } });
  }

  @Post(':id/contacts') @ApiZod(contactSchema)
  async addContact(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(contactSchema)) body: z.infer<typeof contactSchema>) {
    await this.access.application(ctx, id);
    return this.prisma.contact.create({ data: { ...body, workspaceId: ctx.workspaceId, applicationId: id } });
  }

  @Patch(':id/contacts/:contactId') @ApiZod(contactSchema.partial())
  async updateContact(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('contactId') contactId: string, @Body(zp(contactSchema.partial())) body: Partial<z.infer<typeof contactSchema>>) {
    const r = await this.prisma.contact.updateMany({ where: { id: contactId, applicationId: id, workspaceId: ctx.workspaceId }, data: body });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Delete(':id/contacts/:contactId')
  async deleteContact(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('contactId') contactId: string) {
    const r = await this.prisma.contact.deleteMany({ where: { id: contactId, applicationId: id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Post(':id/links') @ApiZod(linkSchema)
  async addLink(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(linkSchema)) body: z.infer<typeof linkSchema>) {
    await this.access.application(ctx, id);
    if (body.roundId) await this.access.round(ctx, body.roundId);
    return this.prisma.attachment.create({ data: { workspaceId: ctx.workspaceId, applicationId: id, roundId: body.roundId, kind: 'link', label: body.label, url: body.url } });
  }

  @Post(':id/attachments') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes, files: 1 } }))
  async upload(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File, @Body('label') label?: string, @Body('roundId') roundId?: string) {
    await this.access.application(ctx, id);
    if (roundId) await this.access.round(ctx, roundId);
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    if (!ATTACH_TYPES.includes(file.mimetype)) throw new BadRequestException(`Allowed types: ${ATTACH_TYPES.join(', ')}`);
    const dir = join(config.uploadDir, ctx.workspaceId);
    await mkdir(dir, { recursive: true });
    const storagePath = join(dir, `${newToken()}.bin`);
    await writeFile(storagePath, file.buffer, { mode: 0o600 });
    const a = await this.prisma.attachment.create({
      data: { workspaceId: ctx.workspaceId, applicationId: id, roundId: roundId || undefined, kind: 'file', label: (label || file.originalname).slice(0, 200), fileName: file.originalname.slice(0, 200), mimeType: file.mimetype, sizeBytes: file.size, storagePath },
    });
    const { storagePath: _, ...rest } = a;
    return rest;
  }

  @Get(':id/attachments/:attId')
  async download(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('attId') attId: string, @Res() res: Response) {
    const a = await this.prisma.attachment.findFirst({ where: { id: attId, applicationId: id, workspaceId: ctx.workspaceId, kind: 'file' } });
    if (!a?.storagePath) throw new NotFoundException();
    const path = resolve(a.storagePath);
    if (!path.startsWith(resolve(config.uploadDir) + sep)) throw new NotFoundException();
    res.setHeader('Content-Type', a.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(a.fileName ?? 'file').replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(await readFile(path));
  }

  @Delete(':id/attachments/:attId')
  async deleteAttachment(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('attId') attId: string) {
    const r = await this.prisma.attachment.deleteMany({ where: { id: attId, applicationId: id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  private async checkStatus(ctx: Ctx, status?: string) {
    if (!status) return;
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    if (!readSettings(ws.settings).statuses.includes(status)) throw new BadRequestException(`Unknown status "${status}". Configure statuses in settings.`);
  }

  private async checkResume(ctx: Ctx, resumeId: string) {
    if (!(await this.prisma.resumeDocument.count({ where: { id: resumeId, workspaceId: ctx.workspaceId } }))) throw new BadRequestException('Resume not found');
  }
}
