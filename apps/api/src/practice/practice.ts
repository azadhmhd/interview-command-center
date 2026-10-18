import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { readSettings } from '../common/workspace-settings';
import { CATALOG } from '../courses/catalog';
import type { LessonQuestion } from '../courses/planner';
import { gradeFromScore, review } from '../knowledge/srs';
import { KnowledgeService } from '../knowledge/questions';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';

const attemptSchema = z.object({
  answer: z.string().min(1).max(50000),
  prompt: z.string().max(10000).optional(),
  occurrenceId: z.string().optional(),
  canonicalQuestionId: z.string().optional(),
  lessonId: z.string().optional(),
  sessionId: z.string().optional(),
  questionIndex: z.number().int().min(0).optional(),
  clientKey: z.string().min(8).max(100).optional(),
  evaluate: z.boolean().default(true),
});
const rubric = z.number().min(0).max(10);
const selfEvalSchema = z.object({
  rubric: z.object({ correctness: rubric, completeness: rubric, depth: rubric, clarity: rubric }),
  missingConcepts: z.array(z.string().max(200)).max(30).default([]),
  improvements: z.array(z.string().max(500)).max(30).default([]),
});
const sessionSchema = z.object({
  roundId: z.string().optional(), courseId: z.string().optional(), roundType: z.string().max(40).optional(),
  count: z.number().int().min(1).max(20).default(5), learningMode: z.boolean().optional(), title: z.string().max(200).optional(),
  generateWithAi: z.boolean().default(false),
});

interface SessionQuestion { prompt: string; modelAnswer?: string; occurrenceId?: string; canonicalQuestionId?: string; source: string }

@ApiTags('practice')
@Controller('practice')
export class PracticeController {
  constructor(private prisma: PrismaService, private tasks: TasksService, private llm: LlmService, private kb: KnowledgeService) {}

  /** Record an attempt (idempotent with clientKey) and route its evaluation. Without AI, self-evaluate. */
  @Post('attempts') @ApiZod(attemptSchema)
  async attempt(@CurrentCtx() ctx: Ctx, @Body(zp(attemptSchema)) body: z.infer<typeof attemptSchema>) {
    if (body.clientKey) {
      const dup = await this.prisma.answerAttempt.findUnique({ where: { workspaceId_clientKey: { workspaceId: ctx.workspaceId, clientKey: body.clientKey } }, include: { evaluation: true } });
      if (dup) return { attempt: dup, task: null, duplicate: true };
    }
    const resolved = await this.resolvePrompt(ctx, body);
    const attempt = await this.prisma.answerAttempt.create({
      data: {
        workspaceId: ctx.workspaceId, userId: ctx.userId, answer: body.answer, prompt: resolved.prompt, clientKey: body.clientKey,
        occurrenceId: body.occurrenceId, canonicalQuestionId: resolved.canonicalQuestionId, lessonId: body.lessonId, sessionId: body.sessionId, questionIndex: body.questionIndex,
      },
    });
    if (body.lessonId) await this.prisma.preparationModule.updateMany({ where: { id: body.lessonId, status: 'not_started' }, data: { status: 'in_progress' } });
    const llm = await this.llm.status(ctx.workspaceId);
    // Mock session answers are evaluated together when the session is completed.
    const task = body.evaluate && !body.sessionId ? await this.evaluate(ctx, attempt) : null;
    return { attempt, task, modelAnswer: resolved.modelAnswer ?? null, selfEvaluationSuggested: !llm.available };
  }

  @Get('attempts')
  list(@CurrentCtx() ctx: Ctx, @Query('canonicalQuestionId') canonicalQuestionId?: string, @Query('occurrenceId') occurrenceId?: string, @Query('lessonId') lessonId?: string, @Query('sessionId') sessionId?: string) {
    return this.prisma.answerAttempt.findMany({
      where: { workspaceId: ctx.workspaceId, ...(canonicalQuestionId && { canonicalQuestionId }), ...(occurrenceId && { occurrenceId }), ...(lessonId && { lessonId }), ...(sessionId && { sessionId }) },
      orderBy: { createdAt: 'desc' }, take: 200, include: { evaluation: true },
    });
  }

  /** Attempt with evaluation, the previous attempt for comparison, and the (now revealed) model answer. */
  @Get('attempts/:id')
  async get(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const a = await this.prisma.answerAttempt.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { evaluation: true } });
    if (!a) throw new NotFoundException();
    const previous = a.canonicalQuestionId
      ? await this.prisma.answerAttempt.findFirst({ where: { workspaceId: ctx.workspaceId, canonicalQuestionId: a.canonicalQuestionId, createdAt: { lt: a.createdAt } }, orderBy: { createdAt: 'desc' }, include: { evaluation: true } })
      : null;
    const task = await this.prisma.agentTask.findUnique({ where: { idempotencyKey: `answer_evaluation:${a.id}` }, select: { id: true, state: true, executionMethod: true, routingReason: true, lastError: true } });
    const resolved = await this.resolvePrompt(ctx, { ...a, occurrenceId: a.occurrenceId ?? undefined, canonicalQuestionId: a.canonicalQuestionId ?? undefined, lessonId: a.lessonId ?? undefined, sessionId: a.sessionId ?? undefined, questionIndex: a.questionIndex ?? undefined });
    return { ...a, previous, task, modelAnswer: resolved.modelAnswer ?? null };
  }

  @Post('attempts/:id/self-evaluation') @ApiZod(selfEvalSchema)
  async selfEvaluate(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(selfEvalSchema)) body: z.infer<typeof selfEvalSchema>) {
    const a = await this.prisma.answerAttempt.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!a) throw new NotFoundException();
    const r = body.rubric;
    const score = Math.round(((r.correctness + r.completeness + r.depth + r.clarity) / 4) * 10) / 10;
    const ev = await this.prisma.answerEvaluation.upsert({
      where: { attemptId: id },
      create: { attemptId: id, source: 'self', score, rubric: r, missingConcepts: body.missingConcepts, improvements: body.improvements, incorrectClaims: [], followUps: [], confidence: 'low' },
      update: { source: 'self', score, rubric: r, missingConcepts: body.missingConcepts, improvements: body.improvements },
    });
    await applyEvaluationToSrs(this.prisma, a.canonicalQuestionId, score);
    // Self-evaluation satisfies the attempt; cancel a pending AI evaluation for it.
    const t = await this.prisma.agentTask.findUnique({ where: { idempotencyKey: `answer_evaluation:${id}` } });
    if (t && ['ready_for_agent', 'retry_wait', 'scheduled'].includes(t.state)) await this.tasks.move(t, 'cancelled');
    return ev;
  }

  /** Add the attempt's question to the revision queue now. */
  @Post('attempts/:id/revise')
  async addToRevision(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const a = await this.prisma.answerAttempt.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!a) throw new NotFoundException();
    const canonicalId = a.canonicalQuestionId ?? (await this.kb.canonicalFor(ctx.workspaceId, a.prompt)).id;
    if (!a.canonicalQuestionId) await this.prisma.answerAttempt.update({ where: { id }, data: { canonicalQuestionId: canonicalId } });
    await this.prisma.canonicalQuestion.update({ where: { id: canonicalId }, data: { inRevision: true, dueAt: new Date() } });
    return { canonicalQuestionId: canonicalId };
  }

  // ── Mock interview sessions ──

  @Post('sessions') @ApiZod(sessionSchema)
  async createSession(@CurrentCtx() ctx: Ctx, @Body(zp(sessionSchema)) body: z.infer<typeof sessionSchema>) {
    let roundType = body.roundType;
    let applicationId: string | null = null;
    const pool: SessionQuestion[] = [];
    if (body.roundId) {
      const round = await this.prisma.interviewRound.findFirst({ where: { id: body.roundId, workspaceId: ctx.workspaceId } });
      if (!round) throw new NotFoundException('Round not found');
      roundType ??= round.type;
      applicationId = round.applicationId;
    }
    if (body.courseId) {
      const course = await this.prisma.preparationCourse.findFirst({ where: { id: body.courseId, workspaceId: ctx.workspaceId }, include: { lessons: true, round: true } });
      if (!course) throw new NotFoundException('Course not found');
      roundType ??= course.round?.type;
      for (const l of course.lessons) for (const q of l.questions as unknown as LessonQuestion[]) pool.push({ prompt: q.prompt, modelAnswer: q.modelAnswer, occurrenceId: q.occurrenceId, source: q.source });
    }
    // Past reported questions of the same round type, weakest first, then due revision items, then catalog practice.
    const reported = await this.prisma.interviewQuestionOccurrence.findMany({
      where: { workspaceId: ctx.workspaceId, source: 'REPORTED', ...(roundType && { round: { type: roundType } }) },
      orderBy: [{ confidence: { sort: 'asc', nulls: 'first' } }], take: 20,
    });
    pool.push(...reported.map((o) => ({ prompt: o.prompt, modelAnswer: o.approvedAnswer ?? o.improvedAnswer ?? undefined, occurrenceId: o.id, canonicalQuestionId: o.canonicalQuestionId ?? undefined, source: 'REPORTED' })));
    const due = await this.prisma.canonicalQuestion.findMany({ where: { workspaceId: ctx.workspaceId, inRevision: true, dueAt: { lte: new Date() }, ...(roundType && { roundTypes: { has: roundType } }) }, take: 10 });
    pool.push(...due.map((c) => ({ prompt: c.prompt, modelAnswer: c.bestAnswer ?? undefined, canonicalQuestionId: c.id, source: 'REPORTED' })));
    for (const t of CATALOG.filter((t) => !roundType || t.roundTypes.includes(roundType))) pool.push(...t.questions.map((prompt) => ({ prompt, source: 'PRACTICE' })));
    const seen = new Set<string>();
    const questions = pool.filter((q) => (seen.has(q.prompt) ? false : (seen.add(q.prompt), true))).slice(0, body.count);
    if (!questions.length) throw new BadRequestException('No questions available for this session yet');

    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const session = await this.prisma.practiceSession.create({
      data: {
        workspaceId: ctx.workspaceId, courseId: body.courseId, roundId: body.roundId, kind: 'mock', roundType, learningMode: body.learningMode ?? readSettings(ws.settings).learningMode,
        title: body.title ?? `Mock interview${roundType ? ` — ${roundType.replace(/_/g, ' ')}` : ''}`, questions: questions as unknown as Prisma.InputJsonValue,
      },
    });
    const task = body.generateWithAi
      ? await this.tasks.create(ctx, { type: 'mock_generation', title: `Generate mock questions: ${session.title}`, idempotencyKey: `mock_generation:${session.id}`, input: { sessionId: session.id, roundId: body.roundId, courseId: body.courseId, count: body.count }, applicationId, roundId: body.roundId, courseId: body.courseId, priority: 3 })
      : null;
    return { session: await this.sessionView(ctx, session.id), task };
  }

  @Get('sessions')
  sessions(@CurrentCtx() ctx: Ctx) {
    return this.prisma.practiceSession.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { attempts: true } } } });
  }

  @Get('sessions/:id')
  session(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.sessionView(ctx, id);
  }

  @Post('sessions/:id/complete')
  async complete(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.practiceSession.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: { status: 'completed', completedAt: new Date() } });
    if (!r.count) throw new NotFoundException();
    // Evaluate the latest attempt per question (idempotent per attempt, so re-completing is safe).
    const attempts = await this.prisma.answerAttempt.findMany({ where: { sessionId: id, workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, include: { evaluation: true } });
    const seen = new Set<number | null>();
    for (const a of attempts) {
      if (seen.has(a.questionIndex)) continue;
      seen.add(a.questionIndex);
      if (!a.evaluation) await this.evaluate(ctx, a);
    }
    return this.sessionView(ctx, id);
  }

  private evaluate(ctx: Ctx, a: { id: string; prompt: string }) {
    return this.tasks.create(ctx, { type: 'answer_evaluation', title: `Evaluate answer: ${a.prompt.slice(0, 60)}`, idempotencyKey: `answer_evaluation:${a.id}`, input: { attemptId: a.id }, priority: 2 });
  }

  private async sessionView(ctx: Ctx, id: string) {
    const s = await this.prisma.practiceSession.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { attempts: { include: { evaluation: true }, orderBy: { createdAt: 'asc' } } } });
    if (!s) throw new NotFoundException();
    const attempted = new Set(s.attempts.map((a) => a.questionIndex));
    const questions = (s.questions as unknown as SessionQuestion[]).map((q, i) => ({
      ...q, modelAnswer: s.learningMode || s.status === 'completed' ? q.modelAnswer : undefined, hasModelAnswer: !!q.modelAnswer, attempted: attempted.has(i),
    }));
    const scored = s.attempts.filter((a) => a.evaluation);
    return { ...s, questions, averageScore: scored.length ? Math.round((scored.reduce((x, a) => x + a.evaluation!.score, 0) / scored.length) * 10) / 10 : null };
  }

  /** Find the prompt text, canonical link and model answer for whatever the attempt points at (all workspace-scoped). */
  private async resolvePrompt(ctx: Ctx, b: { prompt?: string; occurrenceId?: string; canonicalQuestionId?: string; lessonId?: string; sessionId?: string; questionIndex?: number }) {
    if (b.occurrenceId) {
      const o = await this.prisma.interviewQuestionOccurrence.findFirst({ where: { id: b.occurrenceId, workspaceId: ctx.workspaceId } });
      if (!o) throw new NotFoundException('Question not found');
      return { prompt: o.prompt, canonicalQuestionId: o.canonicalQuestionId ?? undefined, modelAnswer: o.approvedAnswer ?? o.improvedAnswer ?? undefined };
    }
    const list = b.lessonId
      ? (await this.prisma.preparationModule.findFirst({ where: { id: b.lessonId, course: { workspaceId: ctx.workspaceId } } }))?.questions
      : b.sessionId ? (await this.prisma.practiceSession.findFirst({ where: { id: b.sessionId, workspaceId: ctx.workspaceId } }))?.questions : undefined;
    if ((b.lessonId || b.sessionId) && !list) throw new NotFoundException('Lesson or session not found');
    if (list) {
      const q = (list as unknown as SessionQuestion[])[b.questionIndex ?? -1];
      if (!q) throw new BadRequestException('questionIndex out of range');
      const canonical = q.canonicalQuestionId ?? (q.occurrenceId ? (await this.prisma.interviewQuestionOccurrence.findFirst({ where: { id: q.occurrenceId, workspaceId: ctx.workspaceId } }))?.canonicalQuestionId ?? undefined : (await this.kb.canonicalFor(ctx.workspaceId, q.prompt)).id);
      return { prompt: q.prompt, canonicalQuestionId: canonical, modelAnswer: q.modelAnswer };
    }
    if (b.canonicalQuestionId) {
      const c = await this.prisma.canonicalQuestion.findFirst({ where: { id: b.canonicalQuestionId, workspaceId: ctx.workspaceId } });
      if (!c) throw new NotFoundException('Question not found');
      return { prompt: c.prompt, canonicalQuestionId: c.id, modelAnswer: c.bestAnswer ?? undefined };
    }
    if (!b.prompt) throw new BadRequestException('Provide prompt, occurrenceId, canonicalQuestionId, lessonId or sessionId');
    return { prompt: b.prompt, canonicalQuestionId: (await this.kb.canonicalFor(ctx.workspaceId, b.prompt)).id, modelAnswer: undefined };
  }
}

/** Every evaluation (AI or self) updates the spaced-repetition schedule and mastery of the canonical question. */
export async function applyEvaluationToSrs(prisma: PrismaService, canonicalQuestionId: string | null, score: number) {
  if (!canonicalQuestionId) return;
  const c = await prisma.canonicalQuestion.findUnique({ where: { id: canonicalQuestionId } });
  if (!c) return;
  const next = review(c, gradeFromScore(score));
  await prisma.canonicalQuestion.update({ where: { id: c.id }, data: { ...next, lastReviewedAt: new Date(), inRevision: true } });
}
