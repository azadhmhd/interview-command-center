import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZod, Ctx, CurrentCtx, optDate, optInt, optStr, zp } from '../common/http';
import { readSettings } from '../common/workspace-settings';
import { PrismaService } from '../prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { WorkspaceAccess } from '../workspaces/workspaces';

const roundSchema = z.object({
  type: z.string().min(1).max(40), title: optStr(200), scheduledAt: optDate(), durationMinutes: optInt(), interviewer: optStr(200),
  format: z.enum(['video', 'phone', 'onsite', 'take_home']).optional().nullable(), meetingLink: z.string().url().max(2000).optional().nullable().or(z.literal('').transform(() => null)),
  status: z.enum(['planned', 'scheduled', 'completed', 'cancelled']).optional(), outcome: z.enum(['pending', 'passed', 'failed', 'unknown']).optional(),
  feedback: optStr(), nextSteps: optStr(), notes: optStr(100000), confidence: z.number().int().min(1).max(5).optional().nullable(),
  studyHoursAvailable: optInt(), prepIntensity: z.enum(['QUICK', 'STANDARD', 'DEEP']).optional(),
});
const reorderSchema = z.object({ ids: z.array(z.string()).min(1).max(50) });

@ApiTags('rounds')
@Controller()
export class RoundsController {
  constructor(private prisma: PrismaService, private access: WorkspaceAccess, private scheduler: SchedulerService) {}

  @Post('applications/:id/rounds') @ApiZod(roundSchema)
  async create(@CurrentCtx() ctx: Ctx, @Param('id') applicationId: string, @Body(zp(roundSchema)) body: z.infer<typeof roundSchema>) {
    await this.access.application(ctx, applicationId);
    await this.checkType(ctx, body.type);
    const last = await this.prisma.interviewRound.findFirst({ where: { applicationId }, orderBy: { sequence: 'desc' } });
    const round = await this.prisma.interviewRound.create({
      data: { ...body, status: body.status ?? (body.scheduledAt ? 'scheduled' : 'planned'), workspaceId: ctx.workspaceId, applicationId, sequence: (last?.sequence ?? 0) + 1 },
    });
    await this.prisma.applicationActivity.create({ data: { workspaceId: ctx.workspaceId, applicationId, type: 'round', message: `Round ${round.sequence} added: ${round.title ?? round.type}`, actorId: ctx.userId } });
    await this.scheduler.planRound(round, ctx.userId);
    return round;
  }

  @Post('applications/:id/rounds/reorder') @ApiZod(reorderSchema)
  async reorder(@CurrentCtx() ctx: Ctx, @Param('id') applicationId: string, @Body(zp(reorderSchema)) body: { ids: string[] }) {
    await this.access.application(ctx, applicationId);
    const rounds = await this.prisma.interviewRound.findMany({ where: { applicationId }, select: { id: true } });
    if (rounds.length !== body.ids.length || !rounds.every((r) => body.ids.includes(r.id))) throw new BadRequestException('ids must list every round of this application exactly once');
    await this.prisma.$transaction(body.ids.map((id, i) => this.prisma.interviewRound.update({ where: { id }, data: { sequence: i + 1 } })));
    return { ok: true };
  }

  /** Interview timeline across all applications. */
  @Get('rounds')
  timeline(@CurrentCtx() ctx: Ctx, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string) {
    return this.prisma.interviewRound.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(status && { status: { in: status.split(',') } }),
        ...((from || to) && { scheduledAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
      },
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }],
      include: { application: { select: { id: true, companyName: true, jobTitle: true, status: true } }, _count: { select: { occurrences: true, courses: true } } },
      take: 500,
    });
  }

  @Get('rounds/:id')
  async get(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.access.round(ctx, id);
    return this.prisma.interviewRound.findUniqueOrThrow({
      where: { id },
      include: {
        application: { select: { id: true, companyName: true, jobTitle: true, status: true } },
        occurrences: { orderBy: { createdAt: 'asc' }, include: { canonical: { select: { id: true, masteryStatus: true } }, _count: { select: { attempts: true } } } },
        attachments: { select: { id: true, kind: true, label: true, url: true, fileName: true, applicationId: true, createdAt: true } },
        courses: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, mode: true, createdAt: true, generator: true } },
        reminders: { where: { status: { in: ['pending', 'fired'] } }, orderBy: { dueAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, title: true, state: true, executionMethod: true, scheduledFor: true, routingReason: true } },
      },
    });
  }

  @Patch('rounds/:id') @ApiZod(roundSchema.partial())
  async update(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(roundSchema.partial())) body: Partial<z.infer<typeof roundSchema>>) {
    const before = await this.access.round(ctx, id);
    if (body.type) await this.checkType(ctx, body.type);
    const data = { ...body };
    if (body.scheduledAt && !body.status && before.status === 'planned') data.status = 'scheduled';
    const round = await this.prisma.interviewRound.update({ where: { id }, data });
    const completedNow = round.status === 'completed' && before.status !== 'completed';
    if (completedNow) {
      await this.scheduler.roundCompleted(round, ctx.userId);
      await this.prisma.applicationActivity.create({ data: { workspaceId: ctx.workspaceId, applicationId: round.applicationId, type: 'round', message: `Round ${round.sequence} completed (${round.outcome})`, actorId: ctx.userId } });
    } else if (body.scheduledAt !== undefined || body.status || body.durationMinutes !== undefined) {
      await this.scheduler.planRound(round, ctx.userId);
    }
    if (body.outcome && body.outcome !== before.outcome) {
      await this.prisma.applicationActivity.create({ data: { workspaceId: ctx.workspaceId, applicationId: round.applicationId, type: 'round', message: `Round ${round.sequence} outcome: ${body.outcome}`, actorId: ctx.userId } });
    }
    return round;
  }

  @Delete('rounds/:id')
  async remove(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    await this.access.round(ctx, id);
    await this.prisma.interviewRound.delete({ where: { id } });
    return { ok: true };
  }

  private async checkType(ctx: Ctx, type: string) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    if (!readSettings(ws.settings).roundTypes.some((t) => t.key === type)) throw new BadRequestException(`Unknown round type "${type}". Add it in settings.`);
  }
}
