import { Injectable, Logger } from '@nestjs/common';
import { Application, InterviewRound } from '@prisma/client';
import { readSettings } from '../common/workspace-settings';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { inQuietHours, planMilestones } from './milestones';

const PREP_KINDS = ['prep_milestone', 'interview_day', 'post_interview'];

/** Deterministic scheduling. Nothing here needs an LLM. */
@Injectable()
export class SchedulerService {
  private log = new Logger('Scheduler');
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  /** (Re)plan milestones for a round. Idempotent: keys include the interview time, so rescheduling replaces them. */
  async planRound(round: InterviewRound, userId?: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: round.workspaceId } });
    const s = readSettings(ws.settings);
    const now = new Date();
    const active = round.scheduledAt && round.status !== 'cancelled' && round.status !== 'completed' && round.scheduledAt > now;
    const stamp = round.scheduledAt?.toISOString() ?? 'none';
    const milestones = active
      ? planMilestones({ interviewAt: round.scheduledAt!, durationMinutes: round.durationMinutes, now, tz: s.timezone, quietHours: s.quietHours, milestoneDays: s.milestoneDays })
      : [];
    const keys = milestones.map((m) => `round:${round.id}:${stamp}:${m.key}`);

    // Drop pending milestones from an older schedule.
    await this.prisma.reminder.updateMany({
      where: { roundId: round.id, kind: { in: PREP_KINDS }, status: 'pending', idempotencyKey: { notIn: keys } },
      data: { status: 'dismissed' },
    });
    const staleTasks = await this.prisma.agentTask.findMany({
      where: { roundId: round.id, state: 'scheduled', type: { in: ['course_generation', 'revision_notes'] }, NOT: { idempotencyKey: { startsWith: `round:${round.id}:${stamp}:` } } },
    });
    for (const t of staleTasks) await this.tasks.move(t, 'cancelled').catch(() => undefined);

    for (const [i, m] of milestones.entries()) {
      await this.prisma.reminder.upsert({
        where: { idempotencyKey: keys[i] },
        create: { workspaceId: round.workspaceId, applicationId: round.applicationId, roundId: round.id, kind: m.kind, title: m.title, body: m.body, dueAt: m.dueAt, idempotencyKey: keys[i] },
        update: {},
      });
      if (m.task) {
        await this.tasks.create({ workspaceId: round.workspaceId, userId }, {
          type: m.task, title: m.task === 'course_generation' ? 'Generate crash course' : 'Generate final revision notes',
          idempotencyKey: `${keys[i]}:${m.task}`, input: { roundId: round.id, mode: round.prepIntensity }, scheduledFor: m.dueAt,
          applicationId: round.applicationId, roundId: round.id, priority: m.task === 'course_generation' ? 2 : 3,
        });
      }
    }
    return milestones.length;
  }

  async planFollowUp(app: Application) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: app.workspaceId } });
    const base = app.appliedAt ?? new Date();
    const dueAt = new Date(base.getTime() + readSettings(ws.settings).followUpDays * 864e5);
    await this.prisma.reminder.upsert({
      where: { idempotencyKey: `followup:${app.id}:${base.toISOString().slice(0, 10)}` },
      create: { workspaceId: app.workspaceId, applicationId: app.id, kind: 'follow_up', title: `Follow up with ${app.companyName}`, body: `No response yet for ${app.jobTitle}? Send a polite follow-up.`, dueAt, idempotencyKey: `followup:${app.id}:${base.toISOString().slice(0, 10)}` },
      update: {},
    });
  }

  /** Application closed (offer / rejected / withdrawn): stop reminders and pending AI work for it. */
  async closeApplication(applicationId: string) {
    await this.prisma.reminder.updateMany({ where: { applicationId, status: 'pending' }, data: { status: 'dismissed' } });
    const tasks = await this.prisma.agentTask.findMany({ where: { applicationId, state: { in: ['scheduled', 'queued', 'ready_for_agent', 'retry_wait'] } } });
    for (const t of tasks) await this.tasks.move(t, 'cancelled').catch(() => undefined);
  }

  /** After an interview: capture prompt, revision queue update, gap analysis. */
  async roundCompleted(round: InterviewRound, userId?: string) {
    await this.planRound(round, userId); // dismisses future prep milestones
    await this.prisma.reminder.upsert({
      where: { idempotencyKey: `round:${round.id}:capture` },
      create: { workspaceId: round.workspaceId, applicationId: round.applicationId, roundId: round.id, kind: 'post_interview', title: 'Capture questions & answers while fresh', body: 'Record each question, your original answer and what went wrong.', dueAt: new Date(), idempotencyKey: `round:${round.id}:capture` },
      update: {},
    });
    const occ = await this.prisma.interviewQuestionOccurrence.findMany({ where: { roundId: round.id, canonicalQuestionId: { not: null } }, select: { canonicalQuestionId: true } });
    await this.prisma.canonicalQuestion.updateMany({ where: { id: { in: occ.map((o) => o.canonicalQuestionId!) } }, data: { inRevision: true, dueAt: new Date() } });
    if (occ.length) {
      await this.tasks.create({ workspaceId: round.workspaceId, userId }, {
        type: 'gap_analysis', title: 'Analyse knowledge gaps after the interview', idempotencyKey: `gap:${round.id}:${occ.length}`,
        input: { roundId: round.id }, applicationId: round.applicationId, roundId: round.id, priority: 4,
      });
    }
  }

  /** Fire due reminders (in-app). Respects quiet hours except for interview-day alerts. */
  async fireReminders(now = new Date()) {
    const due = await this.prisma.reminder.findMany({ where: { status: 'pending', dueAt: { lte: now } }, include: { workspace: true }, take: 500 });
    let fired = 0;
    for (const r of due) {
      const s = readSettings(r.workspace.settings);
      if (r.kind !== 'interview_day' && inQuietHours(now, s.timezone, s.quietHours)) continue;
      const res = await this.prisma.reminder.updateMany({ where: { id: r.id, status: 'pending' }, data: { status: 'fired', firedAt: now } });
      fired += res.count;
    }
    return fired;
  }
}
