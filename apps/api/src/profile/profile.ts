import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Res, UploadedFile, UseInterceptors, Patch } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { newToken, sha256 } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, optInt, optStr, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';

const profileSchema = z.object({
  fullName: optStr(120), headline: optStr(200), location: optStr(120), yearsExperience: optInt(),
  targetRoles: z.array(z.string().max(100)).max(20).optional(), secondaryRoles: z.array(z.string().max(100)).max(20).optional(),
  workBalance: optStr(200), coreTech: z.array(z.string().max(60)).max(60).optional(), aiInterests: z.array(z.string().max(60)).max(30).optional(),
  noticePeriodDays: optInt(), salaryTarget: optInt(), salaryCurrency: z.string().max(5).optional(), summary: optStr(5000),
  confirmedFacts: z.record(z.string(), z.unknown()).optional().nullable(),
});

const ALLOWED = { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md' } as const;

/** Deterministic, AI-free skill detection used as a baseline and to label AI output against. */
const KNOWN_TECH = ['Python', 'Django', 'FastAPI', 'Flask', 'Go', 'Golang', 'TypeScript', 'JavaScript', 'Node.js', 'NestJS', 'React', 'Next.js', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'RabbitMQ', 'Celery', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'GraphQL', 'gRPC', 'REST', 'Elasticsearch', 'LangChain', 'LlamaIndex', 'RAG', 'OpenAI', 'PyTorch', 'Airflow', 'Spark', 'Linux', 'CI/CD'];
export function detectTech(text: string) {
  return KNOWN_TECH.filter((t) => new RegExp(`(^|[^A-Za-z])${t.replace(/[.+/]/g, (c) => '\\' + c)}([^A-Za-z]|$)`, 'i').test(text));
}

export async function extractText(buf: Buffer, ext: string): Promise<string> {
  if (ext !== 'pdf') return buf.toString('utf8');
  const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await pdfText(doc, { mergePages: true });
  return text;
}

@ApiTags('profile')
@Controller()
export class ProfileController {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  @Get('profile')
  async get(@CurrentCtx() ctx: Ctx) {
    return this.prisma.candidateProfile.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId }, update: {} });
  }

  @Put('profile') @ApiZod(profileSchema)
  update(@CurrentCtx() ctx: Ctx, @Body(zp(profileSchema)) body: z.infer<typeof profileSchema>) {
    const data = { ...body, confirmedFacts: body.confirmedFacts as Prisma.InputJsonValue | undefined };
    return this.prisma.candidateProfile.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId, ...data }, update: data });
  }

  @Get('resumes')
  list(@CurrentCtx() ctx: Ctx) {
    return this.prisma.resumeDocument.findMany({
      where: { workspaceId: ctx.workspaceId }, orderBy: [{ label: 'asc' }, { version: 'desc' }],
      select: { id: true, label: true, version: true, fileName: true, mimeType: true, sizeBytes: true, isDefault: true, structuredStatus: true, createdAt: true, sha256: true },
    });
  }

  @Get('resumes/:id')
  async one(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.resumeDocument.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r) throw new NotFoundException();
    const { storagePath: _, ...rest } = r;
    return { ...rest, detectedTech: detectTech(r.extractedText ?? '') };
  }

  @Post('resumes') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes, files: 1 } }))
  async upload(@CurrentCtx() ctx: Ctx, @UploadedFile() file: Express.Multer.File | undefined, @Body('label') label?: string) {
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    const ext = ALLOWED[file.mimetype as keyof typeof ALLOWED];
    if (!ext) throw new BadRequestException('Only PDF, plain text or Markdown CVs are accepted');
    if (ext === 'pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('File is not a valid PDF');
    if (ext !== 'pdf' && file.buffer.includes(0)) throw new BadRequestException('Text file contains binary data');
    const cleanLabel = (label || 'Main CV').slice(0, 80);

    let text = '';
    try {
      text = (await extractText(file.buffer, ext)).slice(0, 200_000);
    } catch {
      throw new BadRequestException('Could not read text from this PDF. Is it a scanned image?');
    }

    const dir = join(config.uploadDir, ctx.workspaceId);
    await mkdir(dir, { recursive: true });
    const storagePath = join(dir, `${newToken()}.${ext}`);
    await writeFile(storagePath, file.buffer, { mode: 0o600 });

    const last = await this.prisma.resumeDocument.findFirst({ where: { workspaceId: ctx.workspaceId, label: cleanLabel }, orderBy: { version: 'desc' } });
    const isFirst = !(await this.prisma.resumeDocument.count({ where: { workspaceId: ctx.workspaceId } }));
    const doc = await this.prisma.resumeDocument.create({
      data: {
        workspaceId: ctx.workspaceId, label: cleanLabel, version: (last?.version ?? 0) + 1, fileName: file.originalname.slice(0, 200),
        mimeType: file.mimetype, sizeBytes: file.size, storagePath, sha256: sha256(file.buffer), extractedText: text, isDefault: isFirst,
      },
    });
    // Structured extraction is AI work → routed task (LLM, agent, or waits). Text + keyword detection work without AI.
    if (text.trim()) {
      await this.tasks.create(ctx, {
        type: 'resume_extraction', title: `Extract structure from ${doc.label} v${doc.version}`,
        idempotencyKey: `resume_extraction:${doc.id}`, input: { resumeId: doc.id }, priority: 6,
      });
    }
    const { storagePath: _, extractedText: __, ...rest } = doc;
    return { ...rest, detectedTech: detectTech(text) };
  }

  @Patch('resumes/:id/default')
  async makeDefault(@CurrentCtx() ctx: Ctx, @Param('id') id: string) {
    const r = await this.prisma.resumeDocument.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.resumeDocument.updateMany({ where: { workspaceId: ctx.workspaceId }, data: { isDefault: false } }),
      this.prisma.resumeDocument.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { ok: true };
  }

  /** User reviews AI-inferred structure and confirms (optionally edited) facts → they become the profile's confirmed facts. */
  @Post('resumes/:id/confirm') @ApiZod(z.object({ structured: z.record(z.string(), z.unknown()) }))
  async confirm(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Body(zp(z.object({ structured: z.record(z.string(), z.unknown()) }))) body: { structured: Record<string, unknown> }) {
    const r = await this.prisma.resumeDocument.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.resumeDocument.update({ where: { id }, data: { structured: body.structured as Prisma.InputJsonValue, structuredStatus: 'confirmed' } }),
      this.prisma.candidateProfile.upsert({
        where: { workspaceId: ctx.workspaceId },
        create: { workspaceId: ctx.workspaceId, confirmedFacts: body.structured as Prisma.InputJsonValue },
        update: { confirmedFacts: body.structured as Prisma.InputJsonValue },
      }),
    ]);
    return { ok: true };
  }

  @Get('resumes/:id/file')
  async download(@CurrentCtx() ctx: Ctx, @Param('id') id: string, @Res() res: Response) {
    const r = await this.prisma.resumeDocument.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!r) throw new NotFoundException();
    const path = resolve(r.storagePath);
    if (!path.startsWith(resolve(config.uploadDir) + sep)) throw new NotFoundException();
    res.setHeader('Content-Type', r.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${r.fileName.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(await readFile(path));
  }
}
