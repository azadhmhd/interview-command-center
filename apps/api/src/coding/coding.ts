import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { SECTIONS } from './dsa';
import { findProblem } from './problems';

const resultSchema = z.object({ name: z.string().max(200), passed: z.boolean(), got: z.unknown().optional(), error: z.string().max(2000).optional() });
const submitSchema = z.object({
  slug: z.string().max(80),
  language: z.enum(['python', 'javascript']),
  stage: z.number().int().min(1).max(10),
  code: z.string().min(1).max(50_000),
  notes: z.string().max(5000).optional(),
  results: z.array(resultSchema).max(100),
  /** also ask for an AI review (Claude Code / LLM through the task queue) */
  review: z.boolean().default(false),
});

const SUMMARY = { id: true, problemSlug: true, language: true, stage: true, passed: true, total: true, taskId: true, reviewedAt: true, createdAt: true } satisfies Prisma.CodingSubmissionSelect;

/** Coding practice: sixteen sections of original problems run in the browser, with an optional AI review per submission. */
@ApiTags('coding')
@Controller('coding')
export class CodingController {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  /** Every section with its problems; a problem is done once a run passed all its tests. */
  @Get('sections')
  async sections(@CurrentCtx() ctx: Ctx) {
    const done = await this.solved(ctx);
    return SECTIONS.map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, problems: s.problems.map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, done: done.has(p.slug) })) }));
  }

  /** One section: its lesson, template and problems. */
  @Get('sections/:slug')
  async section(@CurrentCtx() ctx: Ctx, @Param('slug') slug: string) {
    const s = SECTIONS.find((x) => x.slug === slug);
    if (!s) throw new NotFoundException('Section not found');
    const done = await this.solved(ctx);
    return { ...s, problems: s.problems.map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, summary: p.summary, done: done.has(p.slug) })) };
  }

  @Get('problems/:slug')
  problem(@Param('slug') slug: string) {
    const p = findProblem(slug);
    if (!p) throw new NotFoundException('Problem not found');
    return p;
  }

  private async solved(ctx: Ctx) {
    const rows = await this.prisma.codingSubmission.findMany({ where: { workspaceId: ctx.workspaceId, total: { gt: 0 }, passed: { equals: this.prisma.codingSubmission.fields.total } }, select: { problemSlug: true }, distinct: ['problemSlug'] });
    return new Set(rows.map((r) => r.problemSlug));
  }

  @Post('submissions') @ApiZod(submitSchema)
  async submit(@CurrentCtx() ctx: Ctx, @Body(zp(submitSchema)) body: z.infer<typeof submitSchema>) {
    const p = findProblem(body.slug);
    if (!p) throw new NotFoundException('Problem not found');
    const stage = Math.min(body.stage, p.stages.length);
    const submission = await this.prisma.codingSubmission.create({
      data: {
        workspaceId: ctx.workspaceId, userId: ctx.userId, problemSlug: p.slug, language: body.language, stage, code: body.code, notes: body.notes || null,
        passed: body.results.filter((r) => r.passed).length, total: body.results.length, results: body.results as Prisma.InputJsonValue,
      },
      select: SUMMARY,
    });
    if (!body.review) return { submission, task: null };
    const task = await this.tasks.create(ctx, {
      type: 'code_review', title: `Code review: ${p.title} (stage ${stage}, ${body.language})`, idempotencyKey: `code_review:${submission.id}`,
      input: { submissionId: submission.id }, priority: 4,
    });
    await this.prisma.codingSubmission.update({ where: { id: submission.id }, data: { taskId: task.id } });
    return { submission: { ...submission, taskId: task.id }, task };
  }

  @Get('submissions')
  async submissions(@CurrentCtx() ctx: Ctx, @Query('slug') slug?: string) {
    const rows = await this.prisma.codingSubmission.findMany({ where: { workspaceId: ctx.workspaceId, ...(slug && { problemSlug: slug }) }, orderBy: { createdAt: 'desc' }, take: 20, select: { ...SUMMARY, review: true } });
    const tasks = await this.prisma.agentTask.findMany({ where: { id: { in: rows.map((r) => r.taskId).filter((x): x is string => !!x) } }, select: { id: true, state: true, executionMethod: true, lastError: true } });
    return rows.map((r) => ({ ...r, task: tasks.find((x) => x.id === r.taskId) ?? null }));
  }

  @Get('submissions/:id')
  async submission(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const s = await this.prisma.codingSubmission.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!s) throw new NotFoundException('Submission not found');
    const task = s.taskId ? await this.prisma.agentTask.findUnique({ where: { id: s.taskId }, select: { id: true, state: true, executionMethod: true, lastError: true } }) : null;
    return { ...s, task };
  }
}
