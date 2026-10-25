import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobLeadStatus, JobSource, JobSourceType, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { encrypt } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, optStr, zp } from '../common/http';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { AutoApplyService, evidenceSchema, isProvider, ProviderConfig, PROVIDERS, ProviderType } from './autoapply.service';
import { standingAnswersSchema } from './kit';
import { ADAPTERS, importFromUrl, SourceError } from './sources';
import { AUTOMATABLE_ATS, preferencesSchema, PRESETS } from './state';

const configSchema = z.object({
  preferences: preferencesSchema.optional(),
  standingAnswers: standingAnswersSchema.optional(),
  autoSubmit: z.boolean().optional(),
  minShortlistScore: z.number().int().min(0).max(100).optional(),
  minAutoApplyScore: z.number().int().min(0).max(100).optional(),
  dailyApplyCap: z.number().int().min(0).max(100).optional(),
  allowAiFreeText: z.boolean().optional(),
  discoveryHours: z.number().int().min(1).max(168).optional(),
});
const sourceSchema = z.object({
  type: z.enum(['GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKABLE']),
  name: z.string().min(1).max(120),
  config: z.object({ board: z.string().min(1).max(100), company: z.string().max(200).optional(), baseUrl: z.string().url().optional() }),
  enabled: z.boolean().default(true),
});
const providerSchema = z.object({
  /** '' removes the key; omitted keeps it */
  apiKey: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  monthlyBudget: z.number().int().min(1).max(100_000).optional(),
  everyHours: z.number().int().min(1).max(168).optional(),
  baseUrl: z.string().url().optional(),
});
/** under the web proxy's 30 s timeout (env override for tests) */
const RUN_WAIT_MS = Number(process.env.AUTOAPPLY_RUN_WAIT_MS ?? 20_000);
const BOARD_TYPES = ['GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKABLE'] as JobSourceType[];

/** Never send provider API keys to the browser. */
function redact<T extends JobSource>(s: T) {
  if (!isProvider(s.type)) return s;
  const { apiKeyEnc, ...config } = s.config as ProviderConfig;
  return { ...s, config: { ...config, hasKey: !!apiKeyEnc } };
}

const statusSchema = z.object({ status: z.enum(['EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW', 'APPROVED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN', 'NEEDS_ATTENTION', 'SKIPPED']), reason: optStr(500), verifiedNotSubmitted: z.boolean().default(false) });
const kitSchema = z.object({ answers: z.record(z.string(), z.string().max(5000)).optional(), coverNote: z.string().max(10000).optional(), resumeId: z.string().optional() });
const urlSchema = z.object({ url: z.string().url().max(2000) });
const alertSchema = z.object({ content: z.string().min(10).max(500_000) });
const recruiterSchema = z.object({
  name: optStr(200), email: z.string().email().max(200).optional().nullable(), phone: optStr(50), company: optStr(200), title: optStr(200),
  linkedinUrl: z.string().url().max(500).optional().nullable(), notes: optStr(5000), leadId: z.string().optional().nullable(),
});
const extractSchema = z.object({ text: z.string().min(5).max(200_000), leadId: z.string().optional() });
const resultSchema = z.object({
  status: z.enum(['SUBMITTED', 'BLOCKED', 'NEEDS_ATTENTION', 'FAILED']), evidence: evidenceSchema.optional(),
  filledFields: z.array(z.object({ label: z.string().max(500), value: z.string().max(5000).optional(), source: z.string().max(40).optional() })).max(200).optional(),
  missingFields: z.array(z.string().max(500)).max(200).optional(), error: optStr(2000),
  /** the claude engine records the intent before it starts; false = it never clicked Submit, so the attempt is not a possible submission */
  submitClicked: z.boolean().optional(),
});
/** engine claude: Claude Code in the user's own browser, which can apply on any site; playwright only on the supported ATS forms */
const claimSchema = z.object({ runner: z.string().min(1).max(100), engine: z.enum(['playwright', 'claude']).default('playwright') });
const tokenSchema = z.object({ label: z.string().min(1).max(60).default('apply-runner') });

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

@ApiTags('auto-apply')
@Controller('autoapply')
export class AutoApplyController {
  constructor(private prisma: PrismaService, private svc: AutoApplyService, private tasks: TasksService, private audit: AuditService) {}

  @Get('overview')
  async overview(@CurrentCtx() ctx: Ctx) {
    const [byStatus, sources, cfg, today, needs] = await Promise.all([
      this.prisma.jobLead.groupBy({ by: ['status'], where: { workspaceId: ctx.workspaceId }, _count: true }),
      this.prisma.jobSource.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { name: 'asc' } }).then((r) => r.map(redact)),
      this.svc.config(ctx.workspaceId),
      this.prisma.applyAttempt.count({ where: { workspaceId: ctx.workspaceId, status: 'SUBMITTED', finishedAt: { gte: new Date(Date.now() - 864e5) } } }),
      this.prisma.jobLead.findMany({ where: { workspaceId: ctx.workspaceId, status: 'NEEDS_ATTENTION' }, select: { id: true, title: true, company: true, statusReason: true }, take: 10, orderBy: { updatedAt: 'desc' } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])), sources, submittedToday: today, needsAttention: needs,
      autoSubmit: cfg.autoSubmit, dailyApplyCap: cfg.dailyApplyCap, minAutoApplyScore: cfg.minAutoApplyScore, automatableAts: AUTOMATABLE_ATS,
    };
  }

  // ── config ──
  @Get('config')
  config(@CurrentCtx() ctx: Ctx) {
    return this.svc.config(ctx.workspaceId);
  }

  @Get('presets')
  presets() {
    return PRESETS;
  }

  @Put('config') @ApiZod(configSchema)
  async saveConfig(@CurrentCtx() ctx: Ctx, @Body(zp(configSchema)) body: z.infer<typeof configSchema>) {
    const data = { ...body, preferences: body.preferences as Prisma.InputJsonValue | undefined, standingAnswers: body.standingAnswers as Prisma.InputJsonValue | undefined };
    await this.prisma.autoApplyConfig.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId, ...data }, update: data });
    await this.audit.record(ctx, 'autoapply.config_saved', { type: 'autoapply_config', id: ctx.workspaceId }, { autoSubmit: body.autoSubmit });
    const rescored = body.preferences || body.minShortlistScore !== undefined ? await this.svc.rescoreAll(ctx.workspaceId, ctx.userId) : 0;
    return { ...(await this.svc.config(ctx.workspaceId)), rescored };
  }

  // ── sources ──
  @Get('sources')
  async sources(@CurrentCtx() ctx: Ctx) {
    const rows = await this.prisma.jobSource.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { leads: true } } } });
    return rows.map(redact);
  }

  // ── search providers (role-based discovery) ──
  @Get('providers')
  async providers(@CurrentCtx() ctx: Ctx) {
    const rows = await this.prisma.jobSource.findMany({ where: { workspaceId: ctx.workspaceId, type: { in: Object.keys(PROVIDERS) as JobSourceType[] } } });
    const month = new Date().toISOString().slice(0, 7);
    return (Object.keys(PROVIDERS) as ProviderType[]).map((type) => {
      const row = rows.find((r) => r.type === type);
      const c = (row?.config ?? {}) as ProviderConfig;
      return {
        type, label: PROVIDERS[type].label, id: row?.id ?? null, enabled: row?.enabled ?? false, hasKey: !!c.apiKeyEnc, apiKeyLast4: c.apiKeyLast4 ?? null,
        monthlyBudget: c.monthlyBudget ?? PROVIDERS[type].monthlyBudget, usedThisMonth: c.month === month ? (c.used ?? 0) : 0, everyHours: c.everyHours ?? 24,
        lastRunAt: row?.lastRunAt ?? null, lastSuccessAt: row?.lastSuccessAt ?? null, lastError: row?.lastError ?? null, lastFoundCount: row?.lastFoundCount ?? 0,
      };
    });
  }

  @Put('providers/:type') @ApiZod(providerSchema)
  async saveProvider(@CurrentCtx() ctx: Ctx, @Param('type') type: string, @Body(zp(providerSchema)) body: z.infer<typeof providerSchema>) {
    if (!isProvider(type)) throw new NotFoundException();
    if (body.baseUrl && process.env.AUTOAPPLY_ALLOW_CUSTOM_BASE_URL !== 'true') throw new BadRequestException('Custom API hosts are disabled');
    const where = { workspaceId_type_name: { workspaceId: ctx.workspaceId, type: type as JobSourceType, name: PROVIDERS[type].label } };
    const row = await this.prisma.jobSource.findUnique({ where });
    const prev = (row?.config ?? {}) as ProviderConfig;
    const key = body.apiKey === undefined ? {} : body.apiKey === '' ? { apiKeyEnc: undefined, apiKeyLast4: undefined } : { apiKeyEnc: encrypt(body.apiKey.trim()), apiKeyLast4: body.apiKey.trim().slice(-4) };
    const cfg = { ...prev, ...key, ...(body.monthlyBudget && { monthlyBudget: body.monthlyBudget }), ...(body.everyHours && { everyHours: body.everyHours }), ...(body.baseUrl && { baseUrl: body.baseUrl }) };
    const config = JSON.parse(JSON.stringify(cfg)) as Prisma.InputJsonValue; // drops cleared (undefined) keys
    const enabled = body.enabled ?? row?.enabled ?? true;
    await this.prisma.jobSource.upsert({ where, create: { ...where.workspaceId_type_name, config, enabled }, update: { config, enabled } });
    await this.audit.record(ctx, 'autoapply.provider_saved', { type: 'job_source', id: type }, { enabled, keyChanged: body.apiKey !== undefined });
    return (await this.providers(ctx)).find((p) => p.type === type);
  }

  @Post('sources') @ApiZod(sourceSchema)
  async addSource(@CurrentCtx() ctx: Ctx, @Body(zp(sourceSchema)) body: z.infer<typeof sourceSchema>) {
    if (body.config.baseUrl && process.env.AUTOAPPLY_ALLOW_CUSTOM_BASE_URL !== 'true') throw new BadRequestException('Custom API hosts are disabled');
    try {
      return await this.prisma.jobSource.create({ data: { workspaceId: ctx.workspaceId, type: body.type as JobSourceType, name: body.name, config: body.config, enabled: body.enabled } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A source with this name already exists');
      throw e;
    }
  }

  @Patch('sources/:id') @ApiZod(sourceSchema.partial())
  async updateSource(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(sourceSchema.partial())) body: Partial<z.infer<typeof sourceSchema>>) {
    // provider rows keep their (encrypted) config; only enabled/name may change through here
    const boardOnly = body.config || body.type ? { type: { in: BOARD_TYPES } } : {};
    const r = await this.prisma.jobSource.updateMany({ where: { id, workspaceId: ctx.workspaceId, ...boardOnly }, data: { ...body, type: body.type as JobSourceType | undefined, config: body.config } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Delete('sources/:id')
  async deleteSource(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.jobSource.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Post('sources/:id/run') @HttpCode(200)
  async runSource(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const s = await this.prisma.jobSource.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!s) throw new NotFoundException();
    if (!ADAPTERS[s.type] && !isProvider(s.type)) throw new BadRequestException('This source type is import-only');
    if (s.leaseUntil && s.leaseUntil > new Date()) throw new ConflictException('A scan of this source is already running');
    // answer within the web proxy's timeout; a long search keeps running and its jobs appear as they are scored
    const r = await Promise.race([this.svc.runSource(s), new Promise<null>((ok) => setTimeout(() => ok(null), RUN_WAIT_MS).unref())]);
    if (!r) return { found: 0, created: 0, running: true };
    if (r.skipped) throw new ConflictException('A scan of this source is already running');
    return r;
  }

  // ── leads ──
  @Get('leads')
  async leads(@CurrentCtx() ctx: Ctx, @Query('status') status?: string, @Query('q') q?: string, @Query('minScore') minScore?: string, @Query('sourceId') sourceId?: string, @Query('sort') sort?: string) {
    const rows = await this.prisma.jobLead.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(status && { status: { in: status.split(',') as JobLeadStatus[] } }),
        ...(minScore && { fitScore: { gte: Number(minScore) } }),
        ...(sourceId && { sourceId }),
        ...(q && { OR: [{ title: { contains: q, mode: 'insensitive' } }, { company: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }] }),
      },
      orderBy: sort === 'recent' ? [{ discoveredAt: 'desc' }] : [{ fitScore: { sort: 'desc', nulls: 'last' } }, { discoveredAt: 'desc' }],
      take: 300,
      select: {
        id: true, title: true, company: true, location: true, remote: true, status: true, statusReason: true, fitScore: true, blockers: true, atsType: true, sourceType: true,
        discoveredVia: true, publishedAt: true, discoveredAt: true, kitStatus: true, autoApproved: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
        canonicalUrl: true, trackerApplicationId: true,
      },
    });
    // "best fit" = eligible jobs first; a high score with a blocker is still not a recommendation
    return sort === 'recent' ? rows : rows.sort((a, b) => Number(a.blockers.length > 0) - Number(b.blockers.length > 0) || (b.fitScore ?? -1) - (a.fitScore ?? -1));
  }

  @Get('leads/:id')
  async lead(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const l = await this.prisma.jobLead.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: { attempts: { orderBy: { attemptNo: 'desc' } }, recruiters: true, resume: { select: { id: true, label: true, version: true, fileName: true } }, source: { select: { id: true, name: true, type: true } } },
    });
    if (!l) throw new NotFoundException('Job not found');
    const [duplicate, tasks] = await Promise.all([
      this.svc.duplicateReason(l),
      this.prisma.agentTask.findMany({ where: { workspaceId: ctx.workspaceId, inputSnapshot: { path: ['leadId'], equals: id } }, select: { id: true, type: true, state: true, routingReason: true, updatedAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return { ...l, duplicate, tasks, automatable: AUTOMATABLE_ATS.includes(l.atsType) };
  }

  @Patch('leads/:id/status') @ApiZod(statusSchema)
  status(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(statusSchema)) body: z.infer<typeof statusSchema>) {
    return this.svc.setStatus(ctx, id, body.status as JobLeadStatus, body.reason ?? undefined, body.verifiedNotSubmitted);
  }

  @Put('leads/:id/kit') @ApiZod(kitSchema)
  async kit(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(kitSchema)) body: z.infer<typeof kitSchema>) {
    let l = await this.svc.lead(ctx, id);
    if (['SUBMITTED', 'APPLYING'].includes(l.status)) throw new BadRequestException(`Cannot edit the kit of a ${l.status} job`);
    if (body.resumeId) {
      if (!(await this.prisma.resumeDocument.count({ where: { id: body.resumeId, workspaceId: ctx.workspaceId } }))) throw new BadRequestException('CV not found');
      l = await this.prisma.jobLead.update({ where: { id }, data: { resumeId: body.resumeId } });
    }
    return this.svc.prepareKit(l, ctx.userId, { answers: body.answers, coverNote: body.coverNote });
  }

  @Post('leads/:id/rescore') @HttpCode(200)
  async rescore(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const l = await this.svc.lead(ctx, id);
    if (!['DISCOVERED', 'EVALUATED', 'SHORTLISTED', 'SKIPPED', 'READY_FOR_REVIEW'].includes(l.status)) throw new BadRequestException(`A ${l.status} job is not re-scored`);
    const reset = l.status === 'DISCOVERED' || l.status === 'EVALUATED' || l.status === 'SHORTLISTED' ? l : await this.prisma.jobLead.update({ where: { id }, data: { status: 'EVALUATED' } });
    return this.svc.evaluate(reset, ctx.userId);
  }

  @Post('leads/:id/prepare') @HttpCode(200)
  async prepare(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.svc.prepareKit(await this.svc.lead(ctx, id), ctx.userId);
  }

  @Post('leads/:id/submitted') @HttpCode(200) @ApiZod(evidenceSchema)
  submitted(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(evidenceSchema)) body: z.infer<typeof evidenceSchema>) {
    return this.svc.markSubmitted(ctx, id, body);
  }

  @Post('leads/:id/move-to-tracker') @HttpCode(200)
  moveToTracker(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.svc.moveToTracker(ctx, id);
  }

  @Post('leads/:id/fetch-details') @HttpCode(200)
  async fetchDetails(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const l = await this.svc.lead(ctx, id);
    try {
      const job = await importFromUrl(l.canonicalUrl);
      const updated = await this.prisma.jobLead.update({ where: { id }, data: { description: job.description || l.description, location: l.location ?? job.location } });
      for (const email of job.contactEmails ?? []) await this.svc.upsertRecruiter(ctx.workspaceId, { email, company: l.company, source: 'job_post', leadId: id });
      return ['DISCOVERED', 'EVALUATED', 'SHORTLISTED'].includes(updated.status) ? this.svc.evaluate(updated, ctx.userId) : updated;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** Optional operator path: a coding agent (Claude Code + Claude in Chrome) applies using the task package. */
  @Post('leads/:id/agent-task')
  async agentTask(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const l = await this.svc.lead(ctx, id);
    if (!['APPROVED', 'NEEDS_ATTENTION', 'READY_FOR_REVIEW'].includes(l.status)) throw new BadRequestException('Approve the job first');
    const dup = await this.svc.duplicateReason(l);
    if (dup) throw new ConflictException(dup);
    const attempts = await this.prisma.applyAttempt.count({ where: { leadId: id } });
    return this.tasks.create(ctx, { type: 'job_application', title: `Apply: ${l.title} at ${l.company}`, idempotencyKey: `job_application:${id}:${attempts}`, input: { leadId: id }, priority: 3 });
  }

  @Get('attempts/:id/screenshot')
  async screenshot(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Res() res: Response) {
    const a = await this.prisma.applyAttempt.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    const file = (a?.evidence as { screenshot?: string } | null)?.screenshot;
    if (!a || !file || file !== `apply-${a.id}.png` || !/^[a-z0-9]{10,40}$/.test(a.id)) throw new NotFoundException();
    const dir = resolve(config.uploadDir, a.workspaceId);
    const path = resolve(dir, file);
    if (!path.startsWith(dir + sep) || !dir.startsWith(resolve(config.uploadDir) + sep)) throw new NotFoundException();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(await readFile(path));
  }

  // ── imports ──
  @Post('import/url') @ApiZod(urlSchema)
  async importUrl(@CurrentCtx() ctx: Ctx, @Body(zp(urlSchema)) body: { url: string }) {
    try {
      const job = await importFromUrl(body.url);
      const r = await this.svc.ingest(ctx, job, 'pasted URL', 'MANUAL_URL');
      return { lead: r.lead, created: r.created };
    } catch (e) {
      if (e instanceof SourceError || e instanceof Error) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('import/alert') @ApiZod(alertSchema)
  importAlert(@CurrentCtx() ctx: Ctx, @Body(zp(alertSchema)) body: { content: string }) {
    return this.svc.importAlert(ctx, body.content);
  }

  // ── apply runner protocol ──
  @Post('runner/claim') @HttpCode(200) @ApiZod(claimSchema)
  claim(@CurrentCtx() ctx: Ctx, @Body(zp(claimSchema)) body: z.infer<typeof claimSchema>) {
    return this.svc.claim(ctx, body.runner, body.engine);
  }

  @Post('runner/attempts/:id/heartbeat') @HttpCode(200)
  heartbeat(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.svc.heartbeat(ctx, id);
  }

  @Post('runner/attempts/:id/submit-intent') @HttpCode(200)
  submitIntent(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.svc.submitIntent(ctx, id);
  }

  @Post('runner/attempts/:id/result') @HttpCode(200) @ApiZod(resultSchema)
  result(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(resultSchema)) body: z.infer<typeof resultSchema>) {
    return this.svc.reportResult(ctx, id, { ...body, error: body.error ?? undefined });
  }

  @Get('runner-tokens')
  async tokens(@CurrentCtx() ctx: Ctx) {
    const rows = await this.prisma.session.findMany({ where: { userId: ctx.userId, userAgent: { startsWith: 'icc-apply-runner:' }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, label: r.userAgent!.slice('icc-apply-runner:'.length), createdAt: r.createdAt, expiresAt: r.expiresAt }));
  }

  @Post('runner-tokens') @ApiZod(tokenSchema)
  createToken(@CurrentCtx() ctx: Ctx, @Body(zp(tokenSchema)) body: { label: string }) {
    return this.svc.createRunnerToken(ctx, body.label);
  }

  @Delete('runner-tokens/:id')
  async revokeToken(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.session.deleteMany({ where: { id, userId: ctx.userId, userAgent: { startsWith: 'icc-apply-runner:' } } });
    if (!r.count) throw new NotFoundException();
    await this.audit.record(ctx, 'autoapply.runner_token_revoked', { type: 'session', id });
    return { ok: true };
  }

  // ── recruiters (stored for later outreach; nothing is sent) ──
  @Get('recruiters')
  recruiters(@CurrentCtx() ctx: Ctx, @Query('q') q?: string) {
    return this.prisma.recruiterContact.findMany({
      where: { workspaceId: ctx.workspaceId, ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { company: { contains: q, mode: 'insensitive' } }] }) },
      orderBy: { updatedAt: 'desc' }, take: 500, include: { lead: { select: { id: true, title: true, company: true, status: true } } },
    });
  }

  @Post('recruiters') @ApiZod(recruiterSchema)
  async addRecruiter(@CurrentCtx() ctx: Ctx, @Body(zp(recruiterSchema)) body: z.infer<typeof recruiterSchema>) {
    if (!body.email && !body.name) throw new BadRequestException('Give at least a name or an email');
    if (body.leadId) await this.svc.lead(ctx, body.leadId);
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v != null)) as Record<string, string>;
    return this.svc.upsertRecruiter(ctx.workspaceId, { ...clean, source: 'manual' });
  }

  @Patch('recruiters/:id') @ApiZod(recruiterSchema.extend({ lastContactedAt: z.coerce.date().optional().nullable() }))
  async updateRecruiter(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(recruiterSchema.extend({ lastContactedAt: z.coerce.date().optional().nullable() }))) body: Record<string, unknown>) {
    if (body.leadId) await this.svc.lead(ctx, body.leadId as string);
    try {
      const r = await this.prisma.recruiterContact.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: body });
      if (!r.count) throw new NotFoundException();
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Another contact already has this email');
      throw e;
    }
    return { ok: true };
  }

  @Delete('recruiters/:id')
  async deleteRecruiter(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.recruiterContact.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  /** Pull email / phone / LinkedIn out of pasted text (a recruiter message, signature or job post). */
  @Post('recruiters/extract') @HttpCode(200) @ApiZod(extractSchema)
  async extract(@CurrentCtx() ctx: Ctx, @Body(zp(extractSchema)) body: z.infer<typeof extractSchema>) {
    if (body.leadId) await this.svc.lead(ctx, body.leadId);
    const from = body.text.match(/^From:\s*(?:"?([^"<\n]+?)"?\s*)?<?([\w.%+-]+@[\w.-]+\.[a-z]{2,})>?/im);
    const emails = [...new Set((body.text.match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))].filter((e) => !/no-?reply|donotreply|notification/.test(e));
    const phone = body.text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1]?.trim();
    const linkedin = body.text.match(/https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?/i)?.[0];
    const saved = [];
    for (const email of emails.slice(0, 10)) {
      saved.push(await this.svc.upsertRecruiter(ctx.workspaceId, { email, name: from && from[2].toLowerCase() === email ? from[1]?.trim() : undefined, phone, linkedinUrl: linkedin, source: 'manual', leadId: body.leadId }));
    }
    return { saved };
  }

  @Get('recruiters/export.csv')
  async exportCsv(@CurrentCtx() ctx: Ctx, @Res() res: Response) {
    const rows = await this.prisma.recruiterContact.findMany({ where: { workspaceId: ctx.workspaceId }, include: { lead: { select: { title: true, company: true } } }, orderBy: { company: 'asc' } });
    const lines = ['name,email,phone,company,title,linkedin,source,job,last_contacted,notes', ...rows.map((r) => [r.name, r.email, r.phone, r.company, r.title, r.linkedinUrl, r.source, r.lead ? `${r.lead.title} @ ${r.lead.company}` : '', r.lastContactedAt?.toISOString() ?? '', r.notes].map(csv).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="recruiters.csv"');
    res.send(lines.join('\n'));
  }
}
