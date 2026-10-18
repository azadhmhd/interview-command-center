import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentTask, Prisma } from '@prisma/client';
import { config } from '../config';
import { stableHash } from '../common/crypto';
import { readSettings } from '../common/workspace-settings';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma.service';
import { QueueService } from './queue.service';
import { route } from './routing';
import { assertTransition, TaskState } from './state-machine';

export interface Owner {
  workspaceId: string;
  userId?: string;
}

export interface NewTask {
  type: string;
  title: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  priority?: number;
  scheduledFor?: Date;
  applicationId?: string | null;
  roundId?: string | null;
  courseId?: string | null;
  maxAttempts?: number;
  timeoutMs?: number;
}

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private llm: LlmService, private queue: QueueService) {}

  /** Idempotent: the same idempotencyKey always returns the same task. */
  async create(owner: Owner, t: NewTask): Promise<AgentTask> {
    const existing = await this.prisma.agentTask.findUnique({ where: { idempotencyKey: t.idempotencyKey } });
    if (existing) return existing;
    const future = t.scheduledFor && t.scheduledFor.getTime() > Date.now();
    let task: AgentTask;
    try {
      task = await this.prisma.agentTask.create({
        data: {
          workspaceId: owner.workspaceId, createdById: owner.userId, type: t.type, title: t.title, idempotencyKey: t.idempotencyKey,
          priority: t.priority ?? 5, inputSnapshot: t.input as Prisma.InputJsonValue, inputHash: stableHash(t.input),
          applicationId: t.applicationId ?? undefined, roundId: t.roundId ?? undefined, courseId: t.courseId ?? undefined,
          scheduledFor: t.scheduledFor ?? new Date(), maxAttempts: t.maxAttempts ?? 3, timeoutMs: t.timeoutMs ?? config.llm.timeoutMs + 60_000,
          state: 'scheduled', executionMethod: 'llm', routingReason: future ? 'Scheduled for later' : 'Pending routing',
        },
      });
    } catch (e) {
      // Concurrent create with the same key → return the winner.
      if ((e as { code?: string }).code === 'P2002') return this.prisma.agentTask.findUniqueOrThrow({ where: { idempotencyKey: t.idempotencyKey } });
      throw e;
    }
    return future ? task : this.activate(task);
  }

  /** Route a due task to an execution method based on live availability. */
  async activate(task: AgentTask, forceMethod?: 'llm'): Promise<AgentTask> {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: task.workspaceId } });
    const llmStatus = await this.llm.status(task.workspaceId);
    let r = route(task.type, readSettings(ws.settings), llmStatus, config.claudeCli.enabled);
    if (forceMethod === 'llm' && task.type !== 'job_application') {
      if (!llmStatus.available) throw new BadRequestException(`LLM unavailable: ${llmStatus.reason}`);
      r = { method: 'llm', state: 'queued', reason: 'User requested the LLM endpoint' };
    }
    const updated = await this.move(task, r.state, { executionMethod: r.method, routingReason: r.reason, lastError: null, nextRetryAt: null });
    if (r.state === 'queued') await this.queue.enqueue(updated.id, updated.attempts);
    return updated;
  }

  /** Conditional state change: succeeds only if the task is still in the state we read (no lost updates). */
  async move(task: Pick<AgentTask, 'id' | 'state'>, to: TaskState, data: Prisma.AgentTaskUpdateManyMutationInput = {}): Promise<AgentTask> {
    assertTransition(task.state, to);
    const stamp: Prisma.AgentTaskUpdateManyMutationInput = {
      ...(to === 'submitted' && { submittedAt: new Date() }),
      ...(to === 'completed' && { completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }),
      ...(to === 'cancelled' && { cancelledAt: new Date(), leaseOwner: null, leaseExpiresAt: null }),
    };
    const r = await this.prisma.agentTask.updateMany({ where: { id: task.id, state: task.state }, data: { state: to, ...stamp, ...data } });
    if (!r.count) throw new BadRequestException('Task changed concurrently; reload and try again');
    return this.prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } });
  }

  async get(owner: Owner, id: string) {
    const t = await this.prisma.agentTask.findFirst({ where: { id, workspaceId: owner.workspaceId }, include: { history: { orderBy: { startedAt: 'desc' } } } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  list(owner: Owner, filter: { state?: string; type?: string; roundId?: string; courseId?: string; applicationId?: string } = {}) {
    return this.prisma.agentTask.findMany({
      where: {
        workspaceId: owner.workspaceId,
        ...(filter.state && { state: { in: filter.state.split(',') } }),
        ...(filter.type && { type: filter.type }),
        ...(filter.roundId && { roundId: filter.roundId }),
        ...(filter.courseId && { courseId: filter.courseId }),
        ...(filter.applicationId && { applicationId: filter.applicationId }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true, type: true, title: true, state: true, priority: true, executionMethod: true, routingReason: true, attempts: true, maxAttempts: true,
        lastError: true, scheduledFor: true, nextRetryAt: true, createdAt: true, updatedAt: true, completedAt: true, outputRef: true,
        applicationId: true, roundId: true, courseId: true,
      },
    });
  }

  async cancel(owner: Owner, id: string) {
    return this.move(await this.get(owner, id), 'cancelled');
  }

  /**
   * Manual retry from failed / retry_wait / submitted / awaiting_review (reject) / ready_for_agent.
   * Re-routes by policy (the LLM may have come back), or forces the LLM. Attempts reset; history keeps old attempts.
   * Outputs are applied idempotently, so re-running never duplicates records.
   */
  async retry(owner: Owner, id: string, method?: 'llm') {
    const t = await this.get(owner, id);
    if (!['failed', 'retry_wait', 'ready_for_agent', 'awaiting_review', 'submitted'].includes(t.state)) {
      throw new BadRequestException(`A ${t.state} task cannot be retried`);
    }
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: t.workspaceId } });
    const llm = await this.llm.status(t.workspaceId);
    let r = route(t.type, readSettings(ws.settings), llm, config.claudeCli.enabled);
    if (method === 'llm') {
      if (!llm.available) throw new BadRequestException(`LLM unavailable: ${llm.reason}`);
      if (t.type === 'job_application') throw new BadRequestException('Applying needs a browser; run this task with a coding agent');
      r = { method: 'llm', state: 'queued', reason: 'User requested the LLM endpoint' };
    }
    if (r.state === 'ready_for_agent' && t.state === 'ready_for_agent') {
      throw new BadRequestException(`No automatic executor available (${llm.reason ?? 'routing policy prefers an agent'}). Export the task package and run it with a coding agent.`);
    }
    const moved = await this.move(t, r.state, { executionMethod: r.method, routingReason: r.reason, attempts: 0, lastError: null, nextRetryAt: null });
    if (moved.state === 'queued') await this.queue.enqueue(moved.id, 0);
    return moved;
  }
}
