import { Injectable, Logger } from '@nestjs/common';
import { AutoApplyService } from '../autoapply/autoapply.service';
import { ResumeJobs } from '../builder/jobs';
import { PrismaService } from '../prisma.service';
import { QueueService } from '../tasks/queue.service';
import { TaskRunner } from '../tasks/runner';
import { TasksService } from '../tasks/tasks.service';
import { SchedulerService } from './scheduler.service';

/**
 * The worker heartbeat. Everything it does is driven by database state, so it recovers cleanly after restarts and
 * is safe with several workers (all transitions are conditional updates).
 */
@Injectable()
export class TickService {
  private log = new Logger('Tick');
  constructor(
    private prisma: PrismaService, private tasks: TasksService, private runner: TaskRunner,
    private queue: QueueService, private scheduler: SchedulerService, private autoApply: AutoApplyService, private resumeJobs: ResumeJobs,
  ) {}

  async tick(workerId: string, now = new Date()) {
    const stats = { activated: 0, retried: 0, recovered: 0, requeued: 0, reminders: 0, applyRecovered: 0, sourcesScanned: 0, atsChecked: 0 };

    // 1. Scheduled tasks that are due → route them (LLM / agent) now, based on current availability.
    for (const t of await this.prisma.agentTask.findMany({ where: { state: 'scheduled', scheduledFor: { lte: now } }, orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }], take: 50 })) {
      // A milestone course task is redundant if the user already prepared this round manually.
      if (t.type === 'course_generation' && t.roundId && await this.prisma.agentTask.count({ where: { roundId: t.roundId, type: 'course_generation', id: { not: t.id }, state: { notIn: ['cancelled', 'failed'] } } })) {
        await this.tasks.move(t, 'cancelled', { routingReason: 'Skipped: a course task for this round already exists' }).catch(() => undefined);
        continue;
      }
      await this.tasks.activate(t).then(() => stats.activated++).catch((e) => this.log.warn(`activate ${t.id}: ${e.message}`));
    }

    // 2. Backoff elapsed → queue again.
    for (const t of await this.prisma.agentTask.findMany({ where: { state: 'retry_wait', nextRetryAt: { lte: now } }, take: 50 })) {
      try {
        const moved = await this.tasks.move(t, 'queued', { nextRetryAt: null });
        await this.queue.enqueue(moved.id, moved.attempts);
        stats.retried++;
      } catch { /* another worker got it */ }
    }

    // 3. Crash recovery: a worker died mid-task (lease expired) → bounded retry or fail.
    for (const t of await this.prisma.agentTask.findMany({ where: { state: 'running', leaseExpiresAt: { lt: now } }, take: 50 })) {
      const exhausted = t.attempts >= t.maxAttempts;
      const r = await this.prisma.agentTask.updateMany({
        where: { id: t.id, state: 'running', leaseExpiresAt: t.leaseExpiresAt },
        data: exhausted
          ? { state: 'failed', lastError: 'Worker lease expired (process crashed or timed out); retry limit reached', leaseOwner: null, leaseExpiresAt: null }
          : { state: 'retry_wait', nextRetryAt: now, lastError: 'Worker lease expired (process crashed or timed out); retrying', leaseOwner: null, leaseExpiresAt: null },
      });
      if (r.count) {
        stats.recovered++;
        await this.prisma.agentTaskAttempt.updateMany({ where: { taskId: t.id, status: 'running' }, data: { status: 'failed', error: 'lease expired', finishedAt: now } });
        if (exhausted) {
          const failed = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: t.id } });
          const moved = await this.runner.afterLastAttempt(failed, 'worker lease expired (timed out)').catch((e) => { this.log.warn(`fallback ${t.id}: ${e.message}`); return failed; });
          if (moved.state === 'queued') await this.queue.enqueue(moved.id, 0);
        }
      }
    }

    // 4. Queued tasks nobody picked up (Redis lost the job, or was down) → run them here; the lease prevents double runs.
    const stale = await this.prisma.agentTask.findMany({ where: { state: 'queued', updatedAt: { lt: new Date(now.getTime() - 90_000) } }, orderBy: { priority: 'asc' }, take: 5 });
    for (const t of stale) {
      stats.requeued++;
      await this.runner.run(t.id, workerId).catch((e) => this.log.error(`inline run ${t.id}: ${e.message}`));
    }

    stats.reminders = await this.scheduler.fireReminders(now);

    // 5. Auto Apply: crashed apply runners (never auto-retried after Submit), then due job-source scans.
    stats.applyRecovered = await this.autoApply.recoverStale(now);
    stats.sourcesScanned = await this.autoApply.discoverDue(now).catch((e) => { this.log.warn(`discovery: ${e.message}`); return 0; });
    // 6. ATS gate: approved jobs whose CV scores below ATS_MIN get a tailored CV before the runner may apply.
    stats.atsChecked = await this.resumeJobs.atsTick(now).catch((e) => { this.log.warn(`ATS: ${e.message}`); return 0; });
    if (Object.values(stats).some(Boolean)) this.log.log(JSON.stringify(stats));
    return stats;
  }
}
