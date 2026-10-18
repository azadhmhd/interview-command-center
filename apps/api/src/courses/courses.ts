import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { stableHash } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { readSettings } from '../common/workspace-settings';
import { PrismaService } from '../prisma.service';
import { Owner, TasksService } from '../tasks/tasks.service';
import { WorkspaceAccess } from '../workspaces/workspaces';
import { buildPlan, LessonDraft, LessonQuestion, Mode, PastQuestion } from './planner';

const prepareSchema = z.object({
  mode: z.enum(['QUICK', 'STANDARD', 'DEEP']).optional(),
  studyHours: z.number().min(0.5).max(200).optional(),
  force: z.boolean().default(false),
  useAi: z.boolean().default(true),
});
const lessonPatch = z.object({ status: z.enum(['not_started', 'in_progress', 'completed']).optional(), revisionStatus: z.enum(['none', 'due', 'done']).optional() });

export interface CourseContext {
  roundId: string;
  roundType: string;
  roundTitle?: string | null;
  interviewAt?: string | null;
  durationMinutes?: number | null;
  studyHoursAvailable?: number | null;
  mode: Mode;
  company: string;
  jobTitle: string;
  seniority?: string | null;
  jobDescription?: string | null;
  companyNotes?: string | null;
  candidate: { headline?: string | null; yearsExperience?: number | null; coreTech: string[]; targetRoles: string[]; confirmedFacts?: unknown };
  resumeExcerpt?: string | null;
  resumeLabel?: string | null;
  feedback: string[];
  weakTopics: string[];
  pastQuestions: PastQuestion[];
  completedLessons: string[];
}

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  /** Collect ONLY the context relevant to this round (cost control + privacy: not the whole history). */
  async context(workspaceId: string, roundId: string, mode?: Mode, studyHours?: number): Promise<CourseContext> {
    const round = await this.prisma.interviewRound.findFirstOrThrow({
      where: { id: roundId, workspaceId },
      include: { application: { include: { resume: true } } },
    });
    const app = round.application;
    const [profile, defaultResume, appOcc, kbWeak, priorRounds, done] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { workspaceId } }),
      app.resume ? null : this.prisma.resumeDocument.findFirst({ where: { workspaceId, isDefault: true } }),
      this.prisma.interviewQuestionOccurrence.findMany({
        where: { workspaceId, source: 'REPORTED', OR: [{ applicationId: app.id }, { round: { type: round.type } }] },
        orderBy: { createdAt: 'desc' }, take: 25,
        include: { application: { select: { companyName: true } }, round: { select: { sequence: true, type: true } } },
      }),
      this.prisma.canonicalQuestion.findMany({
        where: { workspaceId, OR: [{ masteryStatus: { in: ['new', 'learning'] }, confidence: { lte: 2 } }, { attempts: { some: { evaluation: { score: { lt: 6 } } } } }] },
        select: { tags: true }, take: 50,
      }),
      this.prisma.interviewRound.findMany({ where: { applicationId: app.id, id: { not: round.id }, feedback: { not: null } }, select: { feedback: true, sequence: true } }),
      this.prisma.preparationModule.findMany({ where: { course: { workspaceId, roundId }, status: 'completed' }, select: { key: true } }),
    ]);
    const resume = app.resume ?? defaultResume;
    const weak = new Set<string>();
    for (const o of appOcc) [...o.conceptsMissed, ...o.conceptsPartial].forEach((c) => weak.add(c));
    for (const c of kbWeak) c.tags.forEach((t) => weak.add(t));
    return {
      roundId: round.id, roundType: round.type, roundTitle: round.title, interviewAt: round.scheduledAt?.toISOString() ?? null,
      durationMinutes: round.durationMinutes, studyHoursAvailable: studyHours ?? round.studyHoursAvailable, mode: mode ?? (round.prepIntensity as Mode),
      company: app.companyName, jobTitle: app.jobTitle, seniority: app.seniority, jobDescription: app.jobDescription?.slice(0, 12000), companyNotes: app.companyNotes?.slice(0, 3000),
      candidate: {
        headline: profile?.headline, yearsExperience: profile?.yearsExperience, coreTech: profile?.coreTech ?? [], targetRoles: profile?.targetRoles ?? [],
        confirmedFacts: profile?.confirmedFacts ?? undefined,
      },
      resumeExcerpt: resume?.extractedText?.slice(0, 6000) ?? null, resumeLabel: resume ? `${resume.label} v${resume.version}` : null,
      feedback: priorRounds.map((r) => `Round ${r.sequence}: ${r.feedback}`).slice(0, 5),
      weakTopics: [...weak].slice(0, 30),
      pastQuestions: appOcc.map((o) => ({
        id: o.id, prompt: o.prompt, source: o.source, missed: [...o.conceptsMissed, ...o.conceptsPartial], mistakes: o.mistakes,
        where: `${o.application?.companyName ?? ''} round ${o.round?.sequence ?? ''}`.trim(),
      })),
      completedLessons: done.map((d) => d.key),
    };
  }

  /**
   * "Prepare for next round": creates the deterministic course immediately (works with no AI), then routes an AI
   * enrichment task. Unchanged context → returns the existing course instead of regenerating.
   */
  async prepare(owner: Owner, roundId: string, opts: z.infer<typeof prepareSchema>) {
    const ctx = await this.context(owner.workspaceId, roundId, opts.mode, opts.studyHours);
    const { completedLessons: _, ...hashable } = ctx;
    const contextHash = stableHash(hashable);
    const existing = await this.prisma.preparationCourse.findFirst({ where: { workspaceId: owner.workspaceId, roundId }, orderBy: { createdAt: 'desc' } });
    if (existing && existing.contextHash === contextHash && !opts.force) {
      return { course: existing, task: null, reused: true };
    }
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
    const plan = buildPlan({
      roundType: ctx.roundType, mode: ctx.mode, now: new Date(), interviewAt: ctx.interviewAt ? new Date(ctx.interviewAt) : null,
      dailyStudyHours: readSettings(ws.settings).dailyStudyHours, studyHoursAvailable: ctx.studyHoursAvailable,
      jobDescription: ctx.jobDescription, jobTitle: ctx.jobTitle, company: ctx.company, weakTopics: ctx.weakTopics, pastQuestions: ctx.pastQuestions,
    });
    const round = await this.prisma.interviewRound.findUniqueOrThrow({ where: { id: roundId } });
    const title = `${ctx.company} — ${round.title ?? ctx.roundType.replace(/_/g, ' ')} (${ctx.mode.toLowerCase()})`;
    const overview = { ...plan.overview, context: { resumeLabel: ctx.resumeLabel, weakTopics: ctx.weakTopics, pastQuestionCount: ctx.pastQuestions.length, hasJobDescription: !!ctx.jobDescription } };

    const course = existing && !opts.force
      // context changed → update the existing course in place, keeping completed lessons
      ? await this.prisma.preparationCourse.update({ where: { id: existing.id }, data: { contextSnapshot: ctx as unknown as Prisma.InputJsonValue, contextHash, overview: overview as unknown as Prisma.InputJsonValue, mode: ctx.mode, title } })
      : await this.prisma.preparationCourse.create({
        data: { workspaceId: owner.workspaceId, applicationId: round.applicationId, roundId, title, mode: ctx.mode, contextSnapshot: ctx as unknown as Prisma.InputJsonValue, contextHash, overview: overview as unknown as Prisma.InputJsonValue },
      });
    await this.mergeLessons(course.id, plan.lessons, 'deterministic');
    await this.prisma.applicationActivity.create({ data: { workspaceId: owner.workspaceId, applicationId: round.applicationId, type: 'course', message: `Preparation course ${existing && !opts.force ? 'updated' : 'created'}: ${title}`, actorId: owner.userId } });

    const task = opts.useAi
      ? await this.tasks.create(owner, {
        type: 'course_generation', title: `AI crash course: ${title}`, idempotencyKey: `course_generation:${course.id}:${contextHash}`,
        input: { courseId: course.id, roundId }, applicationId: round.applicationId, roundId, courseId: course.id, priority: 2,
      })
      : null;
    if (task) {
      // A manual "Prepare" supersedes the milestone-scheduled course task for this round.
      const scheduled = await this.prisma.agentTask.findMany({ where: { roundId, type: 'course_generation', id: { not: task.id }, state: { in: ['scheduled', 'queued', 'ready_for_agent', 'retry_wait'] } } });
      for (const t of scheduled) await this.tasks.move(t, 'cancelled', { routingReason: 'Superseded by a manual Prepare' }).catch(() => undefined);
    }
    return { course, task, reused: false };
  }

  /**
   * Merge lessons by key. Completed lessons are never overwritten (progress is kept); others are replaced and
   * version-bumped. Idempotent, so retries and double imports do not duplicate lessons.
   */
  async mergeLessons(courseId: string, lessons: LessonDraft[], generator: string) {
    const current = await this.prisma.preparationModule.findMany({ where: { courseId } });
    const byKey = new Map(current.map((l) => [l.key, l]));
    const ops = lessons.map((l) => {
      const prev = byKey.get(l.key);
      const data = {
        order: l.order, kind: l.kind, title: l.title, objectives: l.objectives, estimatedMinutes: l.estimatedMinutes, explanation: l.explanation,
        examples: l.examples ?? null, questions: l.questions as unknown as Prisma.InputJsonValue, evaluationCriteria: l.evaluationCriteria,
        commonMistakes: l.commonMistakes, linkedOccurrenceIds: l.linkedOccurrenceIds, scheduledDay: l.scheduledDay, generator,
      };
      if (prev?.status === 'completed') return this.prisma.preparationModule.update({ where: { id: prev.id }, data: { order: l.order, scheduledDay: l.scheduledDay } });
      return prev
        ? this.prisma.preparationModule.update({ where: { id: prev.id }, data: { ...data, version: { increment: generator === prev.generator && stableHash(prev.questions) === stableHash(l.questions) && prev.explanation === l.explanation ? 0 : 1 } } })
        : this.prisma.preparationModule.create({ data: { ...data, courseId, key: l.key } });
    });
    await this.prisma.$transaction(ops);
  }

  /** Model answers are hidden until the user attempts the question, unless learning mode is on. */
  async getCourse(ctx: Ctx, id: string) {
    const course = await this.prisma.preparationCourse.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: {
        lessons: { orderBy: { order: 'asc' } },
        application: { select: { id: true, companyName: true, jobTitle: true } },
        round: { select: { id: true, type: true, title: true, scheduledAt: true, meetingLink: true, interviewer: true, durationMinutes: true } },
        tasks: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, state: true, executionMethod: true, routingReason: true, lastError: true, updatedAt: true }, take: 10 },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const learningMode = readSettings(ws.settings).learningMode;
    const attempts = await this.prisma.answerAttempt.findMany({
      where: { lessonId: { in: course.lessons.map((l) => l.id) } }, include: { evaluation: { select: { score: true } } }, orderBy: { createdAt: 'desc' },
    });
    const attempted = new Set(attempts.map((a) => `${a.lessonId}:${a.questionIndex}`));
    const lessons = course.lessons.map((l) => ({
      ...l,
      questions: (l.questions as unknown as LessonQuestion[]).map((q, i) => {
        const revealed = learningMode || attempted.has(`${l.id}:${i}`);
        return { ...q, modelAnswer: revealed ? q.modelAnswer : undefined, hasModelAnswer: !!q.modelAnswer, attempted: attempted.has(`${l.id}:${i}`) };
      }),
    }));
    return { ...course, lessons, learningMode, readiness: this.readiness(course.lessons, attempts, course.overview as Record<string, unknown>) };
  }

  /** Transparent heuristic — explicitly NOT a prediction of the hiring outcome. */
  readiness(lessons: { status: string; estimatedMinutes: number; kind: string; title: string }[], attempts: { evaluation: { score: number } | null }[], overview: Record<string, unknown>) {
    const total = lessons.reduce((s, l) => s + l.estimatedMinutes, 0) || 1;
    const done = lessons.filter((l) => l.status === 'completed').reduce((s, l) => s + l.estimatedMinutes, 0);
    const scored = attempts.filter((a) => a.evaluation);
    const avg = scored.length ? scored.reduce((s, a) => s + a.evaluation!.score, 0) / scored.length : null;
    const coverage = done / total;
    const score = Math.round((avg === null ? coverage : coverage * 0.6 + (avg / 10) * 0.4) * 100);
    const remaining = lessons.filter((l) => l.status !== 'completed');
    return {
      score, coverage: Math.round(coverage * 100), averageAttemptScore: avg === null ? null : Math.round(avg * 10) / 10, attempts: attempts.length,
      label: score >= 80 ? 'Well prepared' : score >= 50 ? 'Partially prepared' : 'Early stage',
      remainingRisks: [...((overview.risks as string[]) ?? []), ...remaining.slice(0, 5).map((l) => `Not completed: ${l.title}`), ...(avg !== null && avg < 6 ? ['Average practice score below 6/10 — retry weak answers'] : [])],
      note: 'Heuristic based on lesson completion and practice scores. It does not predict the interview outcome.',
    };
  }
}

@ApiTags('courses')
@Controller()
export class CoursesController {
  constructor(private prisma: PrismaService, private courses: CoursesService, private access: WorkspaceAccess, private tasks: TasksService) {}

  @Post('rounds/:id/prepare') @ApiZod(prepareSchema)
  async prepare(@CurrentCtx() ctx: Ctx, @Param('id') roundId: string, @Body(zp(prepareSchema)) body: z.infer<typeof prepareSchema>) {
    await this.access.round(ctx, roundId);
    return this.courses.prepare(ctx, roundId, body);
  }

  @Get('courses')
  async list(@CurrentCtx() ctx: Ctx, @Query('applicationId') applicationId?: string) {
    const courses = await this.prisma.preparationCourse.findMany({
      where: { workspaceId: ctx.workspaceId, ...(applicationId && { applicationId }) }, orderBy: { updatedAt: 'desc' },
      include: {
        lessons: { select: { status: true, estimatedMinutes: true } }, application: { select: { companyName: true, jobTitle: true } },
        round: { select: { type: true, scheduledAt: true, title: true } },
      },
    });
    return courses.map(({ lessons, contextSnapshot: _, ...c }) => ({ ...c, lessonCount: lessons.length, completed: lessons.filter((l) => l.status === 'completed').length, totalMinutes: lessons.reduce((s, l) => s + l.estimatedMinutes, 0) }));
  }

  @Get('courses/:id')
  get(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.courses.getCourse(ctx, id);
  }

  @Delete('courses/:id')
  async remove(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.access.course(ctx, id);
    await this.prisma.preparationCourse.delete({ where: { id } });
    return { ok: true };
  }

  @Patch('courses/:id/lessons/:lessonId') @ApiZod(lessonPatch)
  async updateLesson(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('lessonId') lessonId: string, @Body(zp(lessonPatch)) body: z.infer<typeof lessonPatch>) {
    await this.access.course(ctx, id);
    const r = await this.prisma.preparationModule.updateMany({
      where: { id: lessonId, courseId: id },
      data: { ...body, ...(body.status === 'completed' && { completedAt: new Date() }), ...(body.status && body.status !== 'completed' && { completedAt: null }) },
    });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  /** Regenerate ONE lesson with AI; other lessons and their progress are untouched. */
  @Post('courses/:id/lessons/:lessonId/regenerate')
  async regenerate(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Param('lessonId') lessonId: string) {
    const course = await this.access.course(ctx, id);
    const lesson = await this.prisma.preparationModule.findFirst({ where: { id: lessonId, courseId: id } });
    if (!lesson) throw new NotFoundException();
    if (lesson.status === 'completed') throw new BadRequestException('Mark the lesson as not completed before regenerating it');
    return this.tasks.create(ctx, {
      type: 'lesson_regeneration', title: `Regenerate lesson: ${lesson.title}`, idempotencyKey: `lesson_regeneration:${lesson.id}:v${lesson.version}`,
      input: { courseId: id, lessonKey: lesson.key }, applicationId: course.applicationId, roundId: course.roundId, courseId: id, priority: 3,
    });
  }

  @Post('courses/:id/revision-notes')
  async revisionNotes(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const course = await this.access.course(ctx, id);
    return this.tasks.create(ctx, {
      type: 'revision_notes', title: 'Generate final revision notes', idempotencyKey: `revision_notes:${id}:${course.updatedAt.getTime()}`,
      input: { courseId: id, roundId: course.roundId }, applicationId: course.applicationId, roundId: course.roundId, courseId: id, priority: 3,
    });
  }

  @Post('applications/:id/research')
  async research(@CurrentCtx() ctx: Ctx, @Param('id') applicationId: string) {
    const app = await this.access.application(ctx, applicationId);
    return this.tasks.create(ctx, {
      type: 'company_research', title: `Research public interview patterns: ${app.companyName}`, idempotencyKey: `research:${app.id}:${new Date().toISOString().slice(0, 10)}`,
      input: { applicationId }, applicationId, priority: 5,
    });
  }
}
