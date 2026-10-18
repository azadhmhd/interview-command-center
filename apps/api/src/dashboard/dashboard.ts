import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Ctx, CurrentCtx } from '../common/http';
import { PrismaService } from '../prisma.service';

@ApiTags('dashboard')
@Controller()
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  /** Every number here is derived from stored records. */
  @Get('dashboard')
  async dashboard(@CurrentCtx() ctx: Ctx) {
    const ws = ctx.workspaceId;
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 864e5);
    const [byStatus, upcoming, prepDeadlines, overdueFollowUps, overdueActions, agentTasks, activeTasks, failedTasks, courses, revisionDue, missed, weakCanon, outcomes, notifications, appsTotal, appsWithRounds, offers] = await Promise.all([
      this.prisma.application.groupBy({ by: ['status'], where: { workspaceId: ws, archived: false }, _count: true }),
      this.prisma.interviewRound.findMany({ where: { workspaceId: ws, scheduledAt: { gte: now, lte: in14 }, status: { not: 'cancelled' } }, orderBy: { scheduledAt: 'asc' }, include: { application: { select: { id: true, companyName: true, jobTitle: true } }, courses: { select: { id: true }, take: 1 } } }),
      this.prisma.reminder.findMany({ where: { workspaceId: ws, kind: { in: ['prep_milestone', 'interview_day'] }, status: { in: ['pending', 'fired'] }, dueAt: { lte: in14 } }, orderBy: { dueAt: 'asc' }, take: 20, include: { application: { select: { companyName: true } } } }),
      this.prisma.reminder.findMany({ where: { workspaceId: ws, kind: 'follow_up', status: { in: ['pending', 'fired'] }, dueAt: { lt: now } }, include: { application: { select: { id: true, companyName: true, jobTitle: true } } } }),
      this.prisma.application.findMany({ where: { workspaceId: ws, archived: false, nextActionAt: { lt: now } }, select: { id: true, companyName: true, jobTitle: true, nextAction: true, nextActionAt: true } }),
      this.prisma.agentTask.findMany({ where: { workspaceId: ws, state: { in: ['ready_for_agent', 'submitted', 'awaiting_review'] } }, select: { id: true, title: true, state: true, type: true, routingReason: true }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      this.prisma.agentTask.findMany({ where: { workspaceId: ws, state: { in: ['queued', 'running', 'retry_wait'] } }, select: { id: true, title: true, state: true, type: true }, take: 20 }),
      this.prisma.agentTask.findMany({ where: { workspaceId: ws, state: 'failed' }, select: { id: true, title: true, lastError: true }, take: 20 }),
      this.prisma.preparationCourse.findMany({ where: { workspaceId: ws }, orderBy: { updatedAt: 'desc' }, take: 20, include: { lessons: { select: { status: true } }, round: { select: { scheduledAt: true } } } }),
      this.prisma.canonicalQuestion.count({ where: { workspaceId: ws, inRevision: true, dueAt: { lte: now } } }),
      this.prisma.$queryRaw<{ concept: string; count: number }[]>`SELECT c AS concept, count(*)::int AS count FROM "InterviewQuestionOccurrence", unnest("conceptsMissed" || "conceptsPartial") c WHERE "workspaceId" = ${ws} GROUP BY c ORDER BY count DESC LIMIT 10`,
      this.prisma.$queryRaw<{ tag: string; count: number }[]>`SELECT t AS tag, count(*)::int AS count FROM "CanonicalQuestion", unnest(tags) t WHERE "workspaceId" = ${ws} AND "masteryStatus" IN ('new','learning') GROUP BY t ORDER BY count DESC LIMIT 10`,
      this.prisma.interviewRound.groupBy({ by: ['outcome'], where: { workspaceId: ws, status: 'completed' }, _count: true }),
      this.prisma.reminder.findMany({ where: { workspaceId: ws, status: 'fired' }, orderBy: { dueAt: 'desc' }, take: 20, include: { application: { select: { id: true, companyName: true } } } }),
      this.prisma.application.count({ where: { workspaceId: ws, status: { not: 'Saved' } } }),
      this.prisma.application.count({ where: { workspaceId: ws, status: { not: 'Saved' }, rounds: { some: {} } } }),
      this.prisma.application.count({ where: { workspaceId: ws, OR: [{ status: 'Offer' }, { offerDetails: { not: null } }] } }),
    ]);
    const inProgress = courses.filter((c) => c.lessons.some((l) => l.status !== 'completed')).map((c) => ({
      id: c.id, title: c.title, interviewAt: c.round?.scheduledAt, completed: c.lessons.filter((l) => l.status === 'completed').length, total: c.lessons.length,
    }));
    return {
      totals: { applications: byStatus.reduce((s, r) => s + r._count, 0), byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])) },
      upcomingInterviews: upcoming.map((r) => ({ id: r.id, type: r.type, title: r.title, scheduledAt: r.scheduledAt, application: r.application, hasCourse: r.courses.length > 0 })),
      prepDeadlines, overdueFollowUps, overdueActions, agentTasks, activeTasks, failedTasks, coursesInProgress: inProgress, revisionDue,
      weakCompetencies: { fromInterviews: missed, lowMasteryTags: weakCanon },
      outcomes: Object.fromEntries(outcomes.map((o) => [o.outcome, o._count])),
      conversion: {
        applied: appsTotal, interviewed: appsWithRounds, offers,
        applicationToInterview: appsTotal ? Math.round((appsWithRounds / appsTotal) * 100) : null,
        interviewToOffer: appsWithRounds ? Math.round((offers / appsWithRounds) * 100) : null,
      },
      notifications,
    };
  }

  @Post('reminders/:id/done') @HttpCode(200)
  async done(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.prisma.reminder.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: { status: 'done' } });
    return { ok: true };
  }

  @Post('reminders/:id/dismiss') @HttpCode(200)
  async dismiss(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.prisma.reminder.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: { status: 'dismissed' } });
    return { ok: true };
  }

  @Get('analytics')
  async analytics(@CurrentCtx() ctx: Ctx) {
    const ws = ctx.workspaceId;
    const [scores, mastery, appsPerWeek, roundOutcomes, tokens] = await Promise.all([
      this.prisma.$queryRaw<{ week: Date; avg: number; n: number }[]>`SELECT date_trunc('week', a."createdAt") AS week, avg(e.score)::float AS avg, count(*)::int AS n FROM "AnswerAttempt" a JOIN "AnswerEvaluation" e ON e."attemptId" = a.id WHERE a."workspaceId" = ${ws} GROUP BY 1 ORDER BY 1`,
      this.prisma.canonicalQuestion.groupBy({ by: ['masteryStatus'], where: { workspaceId: ws }, _count: true }),
      this.prisma.$queryRaw<{ week: Date; n: number }[]>`SELECT date_trunc('week', coalesce("appliedAt", "createdAt")) AS week, count(*)::int AS n FROM "Application" WHERE "workspaceId" = ${ws} GROUP BY 1 ORDER BY 1`,
      this.prisma.interviewRound.groupBy({ by: ['type', 'outcome'], where: { workspaceId: ws }, _count: true }),
      this.prisma.$queryRaw<{ day: Date; tokens: number; calls: number }[]>`SELECT date_trunc('day', "createdAt") AS day, coalesce(sum("totalTokens"),0)::int AS tokens, count(*)::int AS calls FROM "AIUsageRecord" WHERE "workspaceId" = ${ws} AND "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
    ]);
    return { scores, mastery, appsPerWeek, roundOutcomes, tokens, note: 'Practice scores are coaching signals, not predictions of hiring outcomes.' };
  }
}
