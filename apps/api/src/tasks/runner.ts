import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { AgentTask, Prisma } from '@prisma/client';
import { AgentPackages } from '../agents/packages';
import { stableHash } from '../common/crypto';
import { readSettings } from '../common/workspace-settings';
import { LlmError, LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma.service';
import { OutputSource, TaskDefinitions } from './definitions';
import { TaskType } from './schemas';
import { backoffMs } from './state-machine';
import { TasksService } from './tasks.service';

export class OutputValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Output failed validation: ${issues.slice(0, 5).join('; ')}`);
  }
}

@Injectable()
export class TaskRunner {
  private log = new Logger('TaskRunner');
  constructor(
    private prisma: PrismaService, private tasks: TasksService, private defs: TaskDefinitions,
    private llm: LlmService, private agents: AgentPackages,
  ) {}

  /** Lease → execute → validate → persist → transition. Safe to call concurrently: only one caller wins the lease. */
  async run(taskId: string, workerId: string): Promise<'ran' | 'skipped'> {
    const pre = await this.prisma.agentTask.findUnique({ where: { id: taskId } });
    if (!pre || pre.state !== 'queued') return 'skipped';
    const leased = await this.prisma.agentTask.updateMany({
      where: { id: taskId, state: 'queued' },
      data: { state: 'running', leaseOwner: workerId, leaseExpiresAt: new Date(Date.now() + pre.timeoutMs + 60_000), attempts: { increment: 1 }, startedAt: new Date() },
    });
    if (!leased.count) return 'skipped';
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    const attempt = await this.prisma.agentTaskAttempt.create({ data: { taskId, attemptNo: task.attempts, method: task.executionMethod, worker: workerId, status: 'running' } });
    try {
      let output: unknown;
      let model: string | undefined;
      const source: OutputSource = task.executionMethod === 'agent_cli' ? 'agent_cli' : 'llm';
      if (task.executionMethod === 'llm') {
        const def = this.defs.get(task.type as TaskType);
        const cfg = await this.llm.effective(task.workspaceId);
        const r = await this.llm.json({
          workspaceId: task.workspaceId, taskId, purpose: task.type, schema: def.schema,
          messages: this.defs.messages(task.type as TaskType, await def.context(task)),
          model: def.evaluation && cfg.evaluationModel ? cfg.evaluationModel : undefined,
        });
        output = r.data;
        model = r.model;
      } else if (task.executionMethod === 'agent_cli') {
        output = await this.agents.runClaudeCli(task);
        model = 'claude-code';
      } else {
        throw new LlmError(`Execution method ${task.executionMethod} cannot run in the worker`, false);
      }
      const done = await this.finish(task, output, source, model);
      await this.prisma.agentTaskAttempt.update({ where: { id: attempt.id }, data: { status: 'succeeded', finishedAt: new Date(), detail: { outputRef: done.outputRef as Prisma.InputJsonValue, model } } });
      return 'ran';
    } catch (e) {
      await this.fail(task, attempt.id, e);
      return 'ran';
    }
  }

  /** Validate, apply idempotently, then mark completed / awaiting_review. Shared by worker runs and agent imports. */
  async finish(task: AgentTask, raw: unknown, source: OutputSource, model?: string) {
    const def = this.defs.get(task.type as TaskType);
    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) throw new OutputValidationError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
    const result = await def.apply(task, parsed.data as never, source, model);
    const fresh = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: task.id }, include: { workspace: true } });
    // Results are already applied and labelled (agent/AI-generated, AI-inferred CV facts, proposed answers), so by
    // default the task just completes; workspaces can opt into a manual approval step.
    const review = result.review && readSettings(fresh.workspace.settings).reviewAiOutput;
    return this.tasks.move(fresh, review ? 'awaiting_review' : 'completed', {
      outputRef: result.outputRef as Prisma.InputJsonValue, resultHash: stableHash(parsed.data),
      validation: { ok: true, source, model, validatedAt: new Date().toISOString() }, leaseOwner: null, leaseExpiresAt: null, lastError: null,
    });
  }

  private async fail(task: AgentTask, attemptId: string, e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    const retryable = e instanceof LlmError ? e.retryable : true;
    this.log.warn(`Task ${task.id} (${task.type}) attempt ${task.attempts} failed: ${msg}`);
    await this.prisma.agentTaskAttempt.update({ where: { id: attemptId }, data: { status: 'failed', error: msg.slice(0, 2000), finishedAt: new Date() } });
    const current = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    if (current.state !== 'running') return; // cancelled meanwhile
    if (retryable && current.attempts < current.maxAttempts) {
      await this.tasks.move(current, 'retry_wait', { lastError: msg.slice(0, 2000), nextRetryAt: new Date(Date.now() + backoffMs(current.attempts)), leaseOwner: null, leaseExpiresAt: null });
      return;
    }
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: task.workspaceId } });
    if (readSettings(ws.settings).fallbackToAgent && current.executionMethod === 'llm') {
      await this.tasks.move(current, 'ready_for_agent', {
        executionMethod: 'agent_manual', lastError: msg.slice(0, 2000), leaseOwner: null, leaseExpiresAt: null,
        routingReason: `LLM failed after ${current.attempts} attempt(s): ${msg.slice(0, 300)} → waiting for manual agent execution or retry`,
      });
      return;
    }
    await this.tasks.move(current, 'failed', { lastError: msg.slice(0, 2000), leaseOwner: null, leaseExpiresAt: null });
  }

  /** Import agent output (manual upload or file sync). Validated; double imports are no-ops. */
  async importOutput(task: AgentTask, raw: unknown, source: OutputSource = 'agent') {
    const def = this.defs.get(task.type as TaskType);
    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      await this.prisma.agentTask.update({ where: { id: task.id }, data: { validation: { ok: false, issues, at: new Date().toISOString() } } });
      throw new BadRequestException({ message: 'Agent output failed validation. Nothing was imported.', issues });
    }
    const hash = stableHash(parsed.data);
    if (task.resultHash === hash && ['awaiting_review', 'completed'].includes(task.state)) return { task, duplicate: true };
    if (task.state === 'completed') throw new ConflictException('Task already completed. Retry it to import a different output.');
    if (task.state === 'running') throw new ConflictException('Task is running in the worker right now');
    let t = task;
    if (!['ready_for_agent', 'submitted'].includes(t.state)) t = await this.tasks.move(t, 'ready_for_agent');
    const attempt = await this.prisma.agentTaskAttempt.create({ data: { taskId: t.id, attemptNo: t.attempts + 1, method: 'agent_manual', status: 'running' } });
    await this.prisma.agentTask.update({ where: { id: t.id }, data: { attempts: { increment: 1 } } });
    try {
      const done = await this.finish(t, parsed.data, source);
      await this.prisma.agentTaskAttempt.update({ where: { id: attempt.id }, data: { status: 'imported', finishedAt: new Date(), detail: { outputRef: done.outputRef as Prisma.InputJsonValue } } });
      return { task: done, duplicate: false };
    } catch (e) {
      await this.prisma.agentTaskAttempt.update({ where: { id: attempt.id }, data: { status: 'failed', error: (e as Error).message.slice(0, 2000), finishedAt: new Date() } });
      throw e;
    }
  }
}
