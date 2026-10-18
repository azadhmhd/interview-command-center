import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, Patch, Post, Query, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma, QuestionSource } from '@prisma/client';
import { z } from 'zod';
import { ApiZod, Ctx, CurrentCtx, optStr, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { WorkspaceAccess } from '../workspaces/workspaces';
import { normalizeQuestion, review } from './srs';

const strArr = () => z.array(z.string().max(200)).max(50).optional();
const occurrenceFields = {
  originalAnswer: optStr(50000), followUps: optStr(), problemStatement: optStr(50000), codeSnippet: optStr(100000), codeLanguage: optStr(30),
  testCases: optStr(), confidence: z.number().int().min(1).max(5).optional().nullable(), conceptsCorrect: strArr(), conceptsPartial: strArr(), conceptsMissed: strArr(),
  mistakes: optStr(), communicationNotes: optStr(), improvedAnswer: optStr(50000), approvedAnswer: optStr(50000), difficulty: z.enum(['easy', 'medium', 'hard']).optional().nullable(),
  tags: strArr(), sourceUrl: z.string().url().max(2000).optional().nullable(), sourceTitle: optStr(300), askedAt: z.coerce.date().optional().nullable(),
};
const captureSchema = z.object({ prompt: z.string().min(3).max(10000), source: z.enum(['REPORTED', 'PUBLIC_REPORT', 'AI_PREDICTED', 'PRACTICE']).default('REPORTED'), ...occurrenceFields });
const updateSchema = z.object({ prompt: z.string().min(3).max(10000).optional(), canonicalQuestionId: z.string().nullable().optional(), ...occurrenceFields });
const extractSchema = z.object({ text: z.string().min(5).max(100000), useAi: z.boolean().default(false) });
const canonicalSchema = z.object({
  prompt: z.string().min(3).max(10000).optional(), tags: strArr(), difficulty: z.enum(['easy', 'medium', 'hard']).optional().nullable(), roundTypes: strArr(),
  masteryStatus: z.enum(['new', 'learning', 'reviewing', 'mastered']).optional(), confidence: z.number().int().min(1).max(5).optional().nullable(),
  bestAnswer: optStr(50000), inRevision: z.boolean().optional(),
});
const reviewSchema = z.object({ grade: z.number().int().min(0).max(5) });

/** Deterministic notes → questions parser. Lines starting with Q:/numbers/ending in "?" start a question; following lines are the answer. */
export function parseQuestionNotes(text: string): { prompt: string; answer?: string }[] {
  const out: { prompt: string; answer: string[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(/^(?:q\d*[:.)]|\d+[.)]|[-*]\s*q[:.]?)\s*(.+)$/i);
    const a = line.match(/^(?:a\d*[:.)]|answer[:.])\s*(.*)$/i);
    if (a && out.length) out[out.length - 1].answer.push(a[1]);
    else if (q || (line.endsWith('?') && line.length > 8)) out.push({ prompt: (q ? q[1] : line).trim(), answer: [] });
    else if (out.length) out[out.length - 1].answer.push(line);
  }
  return out.map((x) => ({ prompt: x.prompt, answer: x.answer.join('\n').trim() || undefined }));
}

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  /** Link (or create) the reusable canonical question for an occurrence. */
  async canonicalFor(workspaceId: string, prompt: string, extra: { tags?: string[]; difficulty?: string | null; roundType?: string } = {}) {
    const normalizedKey = normalizeQuestion(prompt);
    const c = await this.prisma.canonicalQuestion.upsert({
      where: { workspaceId_normalizedKey: { workspaceId, normalizedKey } },
      create: { workspaceId, prompt, normalizedKey, tags: extra.tags ?? [], difficulty: extra.difficulty ?? undefined, roundTypes: extra.roundType ? [extra.roundType] : [] },
      update: {},
    });
    if (extra.roundType && !c.roundTypes.includes(extra.roundType)) {
      return this.prisma.canonicalQuestion.update({ where: { id: c.id }, data: { roundTypes: { push: extra.roundType } } });
    }
    return c;
  }

  async capture(ctx: Pick<Ctx, 'workspaceId'>, data: z.infer<typeof captureSchema>, link: { applicationId?: string; roundId?: string; roundType?: string }) {
    const canonical = await this.canonicalFor(ctx.workspaceId, data.prompt, { tags: data.tags, difficulty: data.difficulty, roundType: link.roundType });
    return this.prisma.interviewQuestionOccurrence.create({
      data: {
        ...data, source: data.source as QuestionSource, workspaceId: ctx.workspaceId, applicationId: link.applicationId, roundId: link.roundId,
        canonicalQuestionId: canonical.id, askedAt: data.askedAt ?? (data.source === 'REPORTED' ? new Date() : undefined),
        ...(data.approvedAnswer && { approvedAt: new Date() }),
      },
    });
  }

  /** Full-text search across occurrences and canonical questions (Postgres websearch syntax). */
  async search(workspaceId: string, q: string, limit = 30) {
    const occ = await this.prisma.$queryRaw<{ id: string; prompt: string; source: string; roundId: string | null; applicationId: string | null; canonicalQuestionId: string | null; rank: number; snippet: string }[]>`
      SELECT o.id, o.prompt, o.source::text, o."roundId", o."applicationId", o."canonicalQuestionId",
             ts_rank(o.search, websearch_to_tsquery('english', ${q})) AS rank,
             ts_headline('english', coalesce(o."originalAnswer", '') || ' ' || coalesce(o."approvedAnswer", ''), websearch_to_tsquery('english', ${q}), 'MaxFragments=1,MaxWords=25,MinWords=8') AS snippet
      FROM "InterviewQuestionOccurrence" o
      WHERE o."workspaceId" = ${workspaceId} AND o.search @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC LIMIT ${limit}`;
    const can = await this.prisma.$queryRaw<{ id: string; prompt: string; masteryStatus: string; tags: string[]; rank: number }[]>`
      SELECT c.id, c.prompt, c."masteryStatus", c.tags, ts_rank(c.search, websearch_to_tsquery('english', ${q})) AS rank
      FROM "CanonicalQuestion" c
      WHERE c."workspaceId" = ${workspaceId} AND (c.search @@ websearch_to_tsquery('english', ${q}) OR ${q} = ANY(c.tags))
      ORDER BY rank DESC LIMIT ${limit}`;
    return { occurrences: occ, canonical: can };
  }
}

@ApiTags('questions')
@Controller()
export class QuestionsController {
  constructor(private prisma: PrismaService, private kb: KnowledgeService, private access: WorkspaceAccess, private tasks: TasksService) {}

  /** Quick capture: only `prompt` is required. */
  @Post('rounds/:roundId/questions') @ApiZod(captureSchema)
  async capture(@CurrentCtx() ctx: Ctx, @Param('roundId') roundId: string, @Body(zp(captureSchema)) body: z.infer<typeof captureSchema>) {
    const round = await this.access.round(ctx, roundId);
    return this.kb.capture(ctx, body, { applicationId: round.applicationId, roundId, roundType: round.type });
  }

  /** Paste raw notes → questions. Deterministic parser always; optional AI extraction as a task. */
  @Post('rounds/:roundId/questions/extract') @ApiZod(extractSchema)
  async extract(@CurrentCtx() ctx: Ctx, @Param('roundId') roundId: string, @Body(zp(extractSchema)) body: z.infer<typeof extractSchema>) {
    const round = await this.access.round(ctx, roundId);
    if (body.useAi) {
      const task = await this.tasks.create(ctx, {
        type: 'question_extraction', title: 'Extract questions from interview notes', idempotencyKey: `extract:${roundId}:${normalizeQuestion(body.text).slice(0, 80)}:${body.text.length}`,
        input: { roundId, text: body.text }, applicationId: round.applicationId, roundId, priority: 3,
      });
      return { task, created: [] };
    }
    const parsed = parseQuestionNotes(body.text);
    if (!parsed.length) throw new BadRequestException('No questions found. Start lines with "Q:" or end them with "?"');
    const existing = new Set((await this.prisma.interviewQuestionOccurrence.findMany({ where: { roundId }, select: { prompt: true } })).map((o) => normalizeQuestion(o.prompt)));
    const created = [];
    for (const p of parsed) {
      if (existing.has(normalizeQuestion(p.prompt))) continue; // importing the same notes twice creates no duplicates
      created.push(await this.kb.capture(ctx, { prompt: p.prompt, originalAnswer: p.answer, source: 'REPORTED' }, { applicationId: round.applicationId, roundId, roundType: round.type }));
    }
    return { created, skipped: parsed.length - created.length };
  }

  @Get('occurrences/:id')
  async getOccurrence(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const o = await this.prisma.interviewQuestionOccurrence.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: {
        round: { select: { id: true, type: true, title: true, sequence: true } }, application: { select: { id: true, companyName: true, jobTitle: true } },
        canonical: true, attempts: { orderBy: { createdAt: 'desc' }, include: { evaluation: true } },
      },
    });
    if (!o) throw new NotFoundException();
    return o;
  }

  /** The original answer is immutable once recorded; improvements go to improvedAnswer / approvedAnswer / attempts. */
  @Patch('occurrences/:id') @ApiZod(updateSchema)
  async updateOccurrence(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(updateSchema)) body: z.infer<typeof updateSchema>) {
    const o = await this.prisma.interviewQuestionOccurrence.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!o) throw new NotFoundException();
    if (body.originalAnswer !== undefined && o.originalAnswer && body.originalAnswer !== o.originalAnswer) {
      throw new ConflictException('The original interview answer is preserved and cannot be changed. Put corrections in the improved or approved answer.');
    }
    if (body.canonicalQuestionId && !(await this.prisma.canonicalQuestion.count({ where: { id: body.canonicalQuestionId, workspaceId: ctx.workspaceId } }))) {
      throw new BadRequestException('Canonical question not found');
    }
    const updated = await this.prisma.interviewQuestionOccurrence.update({
      where: { id },
      data: { ...body, ...(body.improvedAnswer !== undefined && body.improvedAnswer !== o.improvedAnswer && { improvedAnswerBy: 'user' }), ...(body.approvedAnswer && body.approvedAnswer !== o.approvedAnswer && { approvedAt: new Date() }) },
    });
    if (body.approvedAnswer && updated.canonicalQuestionId) {
      await this.prisma.canonicalQuestion.update({ where: { id: updated.canonicalQuestionId }, data: { bestAnswer: body.approvedAnswer } });
    }
    return updated;
  }

  @Delete('occurrences/:id')
  async deleteOccurrence(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.interviewQuestionOccurrence.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  /** AI-proposed improved answer + gap labels. Never touches originalAnswer. */
  @Post('occurrences/:id/improve')
  async improve(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const o = await this.prisma.interviewQuestionOccurrence.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!o) throw new NotFoundException();
    return this.tasks.create(ctx, {
      type: 'answer_improvement', title: `Improve answer: ${o.prompt.slice(0, 60)}`, idempotencyKey: `improve:${o.id}:${o.updatedAt.getTime()}`,
      input: { occurrenceId: o.id }, applicationId: o.applicationId, roundId: o.roundId, priority: 4,
    });
  }

  // ── Knowledge base ──

  @Get('questions')
  async library(
    @CurrentCtx() ctx: Ctx, @Query('q') q?: string, @Query('tag') tag?: string, @Query('roundType') roundType?: string,
    @Query('mastery') mastery?: string, @Query('difficulty') difficulty?: string, @Query('source') source?: string,
  ) {
    let ids: string[] | undefined;
    if (q?.trim()) {
      const r = await this.kb.search(ctx.workspaceId, q.trim(), 200);
      ids = [...new Set([...r.canonical.map((c) => c.id), ...r.occurrences.map((o) => o.canonicalQuestionId).filter((x): x is string => !!x)])];
    }
    const rows = await this.prisma.canonicalQuestion.findMany({
      where: {
        workspaceId: ctx.workspaceId, ...(ids && { id: { in: ids } }), ...(tag && { tags: { has: tag } }), ...(roundType && { roundTypes: { has: roundType } }),
        ...(mastery && { masteryStatus: mastery }), ...(difficulty && { difficulty }), ...(source && { occurrences: { some: { source: source as QuestionSource } } }),
      },
      orderBy: { updatedAt: 'desc' }, take: 300,
      include: { occurrences: { select: { id: true, source: true, application: { select: { companyName: true } } } }, _count: { select: { attempts: true } } },
    });
    const order = ids ? new Map(ids.map((id, i) => [id, i])) : undefined;
    return order ? rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!) : rows;
  }

  @Get('questions/tags')
  async tags(@CurrentCtx() ctx: Ctx) {
    return this.prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT t AS tag, count(*)::int AS count FROM "CanonicalQuestion", unnest(tags) t WHERE "workspaceId" = ${ctx.workspaceId} GROUP BY t ORDER BY count DESC LIMIT 100`;
  }

  @Get('questions/:id')
  async canonical(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const c = await this.prisma.canonicalQuestion.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: {
        occurrences: { orderBy: { createdAt: 'desc' }, include: { application: { select: { id: true, companyName: true, jobTitle: true } }, round: { select: { id: true, type: true, sequence: true } } } },
        attempts: { orderBy: { createdAt: 'desc' }, include: { evaluation: true }, take: 50 },
      },
    });
    if (!c) throw new NotFoundException();
    const related = c.tags.length
      ? await this.prisma.canonicalQuestion.findMany({ where: { workspaceId: ctx.workspaceId, id: { not: id }, tags: { hasSome: c.tags } }, select: { id: true, prompt: true, masteryStatus: true }, take: 8 })
      : [];
    return { ...c, related };
  }

  @Patch('questions/:id') @ApiZod(canonicalSchema)
  async updateCanonical(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(canonicalSchema)) body: z.infer<typeof canonicalSchema>) {
    const r = await this.prisma.canonicalQuestion.updateMany({ where: { id, workspaceId: ctx.workspaceId }, data: body as Prisma.CanonicalQuestionUpdateManyMutationInput });
    if (!r.count) throw new NotFoundException();
    return this.prisma.canonicalQuestion.findUniqueOrThrow({ where: { id } });
  }

  @Get('search')
  search(@CurrentCtx() ctx: Ctx, @Query('q') q = '') {
    if (!q.trim()) return { occurrences: [], canonical: [] };
    return this.kb.search(ctx.workspaceId, q.trim());
  }

  // ── Revision queue (SM-2) ──

  @Get('revision/queue')
  async queue(@CurrentCtx() ctx: Ctx, @Query('all') all?: string) {
    const items = await this.prisma.canonicalQuestion.findMany({
      where: { workspaceId: ctx.workspaceId, inRevision: true, ...(all !== 'true' && { dueAt: { lte: new Date() } }) },
      orderBy: { dueAt: 'asc' }, take: 100,
      include: { occurrences: { select: { id: true, source: true, approvedAnswer: true, improvedAnswer: true, application: { select: { companyName: true } } }, take: 3 } },
    });
    const upcoming = await this.prisma.canonicalQuestion.count({ where: { workspaceId: ctx.workspaceId, inRevision: true, dueAt: { gt: new Date() } } });
    return { due: items, upcomingCount: upcoming };
  }

  @Post('revision/:id/review') @HttpCode(200) @ApiZod(reviewSchema)
  async review(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(reviewSchema)) body: { grade: number }) {
    const c = await this.prisma.canonicalQuestion.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!c) throw new NotFoundException();
    const next = review(c, body.grade);
    return this.prisma.canonicalQuestion.update({ where: { id }, data: { ...next, lastReviewedAt: new Date() } });
  }
}
