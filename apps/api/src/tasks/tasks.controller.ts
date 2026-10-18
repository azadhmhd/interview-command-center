import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AgentPackages } from '../agents/packages';
import { ApiZod, Ctx, CurrentCtx, zp } from '../common/http';
import { config } from '../config';
import { LlmService } from '../llm/llm.service';
import { TaskRunner } from './runner';
import { TasksService } from './tasks.service';

const retrySchema = z.object({ method: z.enum(['llm']).optional() });
const importSchema = z.object({ output: z.unknown() });
const rejectSchema = z.object({ reason: z.string().max(2000).optional() });

@ApiTags('tasks')
@Controller()
export class TasksController {
  constructor(private tasks: TasksService, private runner: TaskRunner, private agents: AgentPackages, private llm: LlmService) {}

  @Get('tasks')
  list(@CurrentCtx() ctx: Ctx, @Query('state') state?: string, @Query('type') type?: string, @Query('roundId') roundId?: string, @Query('courseId') courseId?: string, @Query('applicationId') applicationId?: string) {
    return this.tasks.list(ctx, { state, type, roundId, courseId, applicationId });
  }

  @Get('tasks/:id')
  get(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.tasks.get(ctx, id);
  }

  @Post('tasks/:id/cancel') @HttpCode(200)
  cancel(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.tasks.cancel(ctx, id);
  }

  @Post('tasks/:id/retry') @HttpCode(200) @ApiZod(retrySchema)
  retry(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(retrySchema)) body: z.infer<typeof retrySchema>) {
    return this.tasks.retry(ctx, id, body.method);
  }

  /** Manual handoff: write the agent-ready package and park the task in ready_for_agent. */
  @Post('tasks/:id/handoff') @HttpCode(200)
  async handoff(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    let task = await this.tasks.get(ctx, id);
    if (['running', 'completed', 'cancelled'].includes(task.state)) throw new BadRequestException(`A ${task.state} task cannot be handed off`);
    const { dir, package: pkg } = await this.agents.write(task);
    if (!['ready_for_agent', 'submitted'].includes(task.state)) {
      task = { ...(await this.tasks.move(task, 'ready_for_agent', { executionMethod: 'agent_manual', routingReason: 'Handed off to a coding agent by the user' })), history: task.history };
    }
    return { task, packageDir: dir, package: pkg };
  }

  @Get('tasks/:id/package')
  async pkg(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.agents.build(await this.tasks.get(ctx, id));
  }

  @Post('tasks/:id/submitted') @HttpCode(200)
  async submitted(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.tasks.move(await this.tasks.get(ctx, id), 'submitted');
  }

  @Post('tasks/:id/import') @HttpCode(200) @ApiZod(importSchema)
  async import(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(importSchema)) body: { output: unknown }) {
    return this.runner.importOutput(await this.tasks.get(ctx, id), body.output);
  }

  /** Read output/result.json from the task folder in the agent workspace. */
  @Post('tasks/:id/sync') @HttpCode(200)
  async sync(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const task = await this.tasks.get(ctx, id);
    return this.runner.importOutput(task, await this.agents.readOutput(task.id));
  }

  @Post('tasks/:id/approve') @HttpCode(200)
  async approve(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    return this.tasks.move(await this.tasks.get(ctx, id), 'completed');
  }

  @Post('tasks/:id/reject') @HttpCode(200) @ApiZod(rejectSchema)
  async reject(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(rejectSchema)) body: { reason?: string }) {
    return this.tasks.move(await this.tasks.get(ctx, id), 'ready_for_agent', { lastError: `Rejected in review: ${body.reason ?? 'no reason given'}`, resultHash: null });
  }

  @Get('agents/status')
  async status(@CurrentCtx() ctx: Ctx) {
    return {
      llm: await this.llm.status(ctx.workspaceId),
      manual: { available: true, workspaceDir: config.agentWorkspaceDir, note: 'Open the agent-workspace folder in Claude Code, Cursor or Antigravity and run the task\'s skill.' },
      claudeCli: this.agents.cliStatus(),
      cursor: { unattended: false, note: 'Manual handoff only (no verified unattended integration configured).' },
      antigravity: { unattended: false, note: 'Manual handoff only (no verified unattended integration configured).' },
    };
  }
}
