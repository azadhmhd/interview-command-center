import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { newToken } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { WorkspaceAccess } from '../workspaces/workspaces';
import { DEFAULT_DESIGN, fromProfile, normalizeContent, resumeContentSchema, resumeDesignSchema } from './content';
import { ResumeJobs, resumeFileName } from './jobs';

const createSchema = z.object({ title: z.string().max(120).optional(), from: z.enum(['profile', 'blank']).default('profile') });
const saveSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: resumeContentSchema.optional(),
  design: resumeDesignSchema.optional(),
  /** updatedAt the editor last saw: a save over newer changes (another tab) gets 409 instead of overwriting them */
  baseUpdatedAt: z.string().max(40).optional(),
});
const copySchema = z.object({ title: z.string().max(120).optional(), applicationId: z.string().max(40).optional(), jobLeadId: z.string().max(40).optional() });
const importSchema = z.object({ resumeId: z.string().max(40) });

const LIST_SELECT = {
  id: true, title: true, applicationId: true, jobLeadId: true, sourceDraftId: true, publishedResumeId: true, publishedAt: true, createdAt: true, updatedAt: true,
  application: { select: { id: true, companyName: true, jobTitle: true } }, jobLead: { select: { id: true, company: true, title: true } },
} satisfies Prisma.ResumeDraftSelect;

/** Resume builder: unlimited drafts and job-specific copies, all with the same design system. */
@ApiTags('resume-drafts')
@Controller('resume-drafts')
export class ResumeDraftsController {
  constructor(private prisma: PrismaService, private access: WorkspaceAccess, private tasks: TasksService, private jobs: ResumeJobs) {}

  @Get()
  list(@CurrentCtx() ctx: Ctx, @Query('applicationId') applicationId?: string, @Query('jobLeadId') jobLeadId?: string) {
    return this.prisma.resumeDraft.findMany({
      where: { workspaceId: ctx.workspaceId, ...(applicationId && { applicationId }), ...(jobLeadId && { jobLeadId }) },
      orderBy: { updatedAt: 'desc' }, select: LIST_SELECT,
    });
  }

  @Post() @ApiZod(createSchema)
  async create(@CurrentCtx() ctx: Ctx, @Body(zp(createSchema)) body: z.infer<typeof createSchema>) {
    const profile = await this.prisma.candidateProfile.findUnique({ where: { workspaceId: ctx.workspaceId } });
    const content = body.from === 'blank' ? normalizeContent({ header: { email: ctx.email } }) : fromProfile(profile ?? {}, profile?.confirmedFacts, ctx.email);
    return this.prisma.resumeDraft.create({
      data: { workspaceId: ctx.workspaceId, title: body.title || 'Main resume', content: content as Prisma.InputJsonValue, design: DEFAULT_DESIGN as Prisma.InputJsonValue },
      select: LIST_SELECT,
    });
  }

  /** Turns an uploaded CV into an editable draft (AI task: LLM or coding agent). The draft appears when the task is done. */
  @Post('import') @ApiZod(importSchema)
  async import(@CurrentCtx() ctx: Ctx, @Body(zp(importSchema)) body: z.infer<typeof importSchema>) {
    const r = await this.prisma.resumeDocument.findFirst({ where: { id: body.resumeId, workspaceId: ctx.workspaceId }, select: { id: true, label: true, version: true, extractedText: true } });
    if (!r) throw new NotFoundException('CV not found');
    if (!r.extractedText?.trim()) throw new BadRequestException('This CV has no readable text to import');
    return this.tasks.create(ctx, {
      type: 'resume_draft_import', title: `Import ${r.label} v${r.version} into the resume builder`,
      idempotencyKey: `resume_draft_import:${r.id}:${newToken()}`, input: { resumeId: r.id, title: `${r.label} (imported)` }, priority: 6,
    });
  }

  @Get(':id')
  async one(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.find(ctx, id);
  }

  @Put(':id') @ApiZod(saveSchema)
  async save(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(saveSchema)) body: z.infer<typeof saveSchema>) {
    const d = await this.find(ctx, id);
    if (body.baseUpdatedAt && body.baseUpdatedAt !== d.updatedAt.toISOString()) throw new ConflictException('This resume was changed in another tab or window. Reload to get the latest version.');
    // conditional update: a concurrent save between the read above and this write also loses instead of overwriting
    const r = await this.prisma.resumeDraft.updateMany({
      where: { id, workspaceId: ctx.workspaceId, updatedAt: d.updatedAt },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.content && { content: normalizeContent(body.content) as Prisma.InputJsonValue }),
        ...(body.design && { design: body.design as Prisma.InputJsonValue }),
      },
    });
    if (!r.count) throw new ConflictException('This resume was changed in another tab or window. Reload to get the latest version.');
    return this.find(ctx, id);
  }

  @Delete(':id')
  async remove(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.resumeDraft.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException('Resume not found');
    return { ok: true };
  }

  /** Copy with the same content and design: a free copy, or one linked to an application / job lead. No limit. */
  @Post(':id/duplicate') @ApiZod(copySchema)
  async duplicate(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(copySchema)) body: z.infer<typeof copySchema>) {
    return this.copy(ctx, await this.find(ctx, id), body);
  }

  /** Job copy + AI tailoring task (rewords/reorders only; the master is never touched). Without a job description there is nothing to tailor to, so only the copy is made. */
  @Post(':id/tailor') @ApiZod(copySchema)
  async tailor(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(copySchema)) body: z.infer<typeof copySchema>) {
    if (!body.applicationId && !body.jobLeadId) throw new BadRequestException('Choose an application or a job lead to tailor for');
    const draft = await this.copy(ctx, await this.find(ctx, id), body);
    const description = draft.applicationId
      ? (await this.prisma.application.findUnique({ where: { id: draft.applicationId }, select: { jobDescription: true } }))?.jobDescription
      : (await this.prisma.jobLead.findUnique({ where: { id: draft.jobLeadId! }, select: { description: true } }))?.description;
    if (!description?.trim()) return { draft, task: null, note: 'Copy created. Add a job description to the job to tailor it with AI.' };
    const task = await this.tasks.create(ctx, {
      type: 'resume_tailoring', title: `Tailor resume for ${draft.title}`, idempotencyKey: `resume_tailoring:${draft.id}`,
      input: { draftId: draft.id }, applicationId: draft.applicationId ?? undefined, priority: 5,
    });
    return { draft, task };
  }

  @Get(':id/pdf')
  async download(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Res() res: Response) {
    const d = await this.find(ctx, id);
    const { pdf, pages } = await this.jobs.render(d);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${resumeFileName(d)}"`);
    res.setHeader('X-Page-Count', String(pages));
    res.send(pdf);
  }

  /** Saves the PDF as a new CV version and attaches it to the linked application / job lead (see ResumeJobs.publish). */
  @Post(':id/publish') @HttpCode(201)
  async publish(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.jobs.publish(await this.find(ctx, id), ctx.userId);
  }

  async copy(ctx: Ctx, d: Awaited<ReturnType<ResumeDraftsController['find']>>, body: z.infer<typeof copySchema>) {
    const app = body.applicationId ? await this.access.application(ctx, body.applicationId) : null;
    const lead = body.jobLeadId ? await this.prisma.jobLead.findFirst({ where: { id: body.jobLeadId, workspaceId: ctx.workspaceId } }) : null;
    if (body.jobLeadId && !lead) throw new NotFoundException('Job lead not found');
    const job = app ? `${app.companyName} – ${app.jobTitle}` : lead ? `${lead.company} – ${lead.title}` : '';
    return this.prisma.resumeDraft.create({
      data: {
        workspaceId: ctx.workspaceId, title: (body.title || job || `${d.title} (copy)`).slice(0, 120), content: d.content as Prisma.InputJsonValue,
        design: d.design as Prisma.InputJsonValue, sourceDraftId: d.id, applicationId: app?.id, jobLeadId: lead?.id,
      },
      select: LIST_SELECT,
    });
  }

  async find(ctx: Ctx, id: string) {
    const d = await this.prisma.resumeDraft.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: { application: { select: { id: true, companyName: true, jobTitle: true } }, jobLead: { select: { id: true, company: true, title: true } }, publishedResume: { select: { id: true, label: true, version: true } } },
    });
    if (!d) throw new NotFoundException('Resume not found');
    return d;
  }
}
