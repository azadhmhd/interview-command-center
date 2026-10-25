import { Injectable, Logger } from '@nestjs/common';
import { JobLead, Prisma } from '@prisma/client';
import { ATS_MIN, atsScore } from '../autoapply/matching';
import { AutoApplyService } from '../autoapply/autoapply.service';
import { PrismaService } from '../prisma.service';
import { createResumeDocument } from '../profile/profile';
import { TasksService } from '../tasks/tasks.service';
import { resumeDesignSchema, ResumeContent, ResumeDesign, resumeFileName, toPlainText, toStructured } from './content';
import { PdfRenderer } from './pdf';

type DraftForPublish = { id: string; workspaceId: string; title: string; content: Prisma.JsonValue; design: Prisma.JsonValue; applicationId: string | null; jobLeadId: string | null };

/** Tailoring a stalled task waits for before applying with the CV the job already has. */
const TAILOR_TIMEOUT_MS = 2 * 60 * 60_000;

/**
 * Resume ↔ job work shared by the resume builder and the worker: rendering, publishing a draft as a CV version, and the
 * ATS gate before Auto Apply applies (score the job's CV; below ATS_MIN make a tailored copy, publish it, then apply).
 */
@Injectable()
export class ResumeJobs {
  private log = new Logger('ResumeJobs');
  constructor(private prisma: PrismaService, private tasks: TasksService, private pdf: PdfRenderer, private autoApply: AutoApplyService) {}

  render(d: { title: string; content: Prisma.JsonValue; design: Prisma.JsonValue }) {
    return this.pdf.render({ title: d.title, content: d.content as unknown as ResumeContent, design: resumeDesignSchema.parse(d.design ?? {}) as ResumeDesign });
  }

  /** "Name-Role.pdf", the role taken from the job or application this copy is for (none for your main resume). */
  async fileName(d: Pick<DraftForPublish, 'content' | 'applicationId' | 'jobLeadId'>) {
    const role = d.jobLeadId ? (await this.prisma.jobLead.findUnique({ where: { id: d.jobLeadId }, select: { title: true } }))?.title
      : d.applicationId ? (await this.prisma.application.findUnique({ where: { id: d.applicationId }, select: { jobTitle: true } }))?.jobTitle : null;
    return resumeFileName((d.content as { header?: { fullName?: string } } | null)?.header?.fullName, role);
  }

  /**
   * Saves the PDF as a new CV version (label = resume title) with its facts already confirmed, and attaches it to the
   * linked application / job lead, so Auto Apply uploads this exact CV for that job.
   */
  async publish(d: DraftForPublish, userId?: string) {
    const content = d.content as unknown as ResumeContent;
    const { pdf, pages } = await this.render(d);
    const resume = await createResumeDocument(this.prisma, d.workspaceId, {
      label: d.title, fileName: await this.fileName(d), mimeType: 'application/pdf', ext: 'pdf', buffer: pdf,
      extractedText: toPlainText(content), structured: toStructured(content) as Prisma.InputJsonValue, structuredStatus: 'confirmed',
    });
    // a publish never counts as an edit: keep updatedAt so an open editor's next save is not rejected as a conflict
    await this.prisma.$executeRaw`UPDATE "ResumeDraft" SET "publishedResumeId" = ${resume.id}, "publishedAt" = now() WHERE id = ${d.id}`;
    if (d.applicationId) await this.prisma.application.update({ where: { id: d.applicationId }, data: { resumeId: resume.id } });
    let leadNote: string | undefined;
    if (d.jobLeadId) {
      const lead = await this.prisma.jobLead.findUniqueOrThrow({ where: { id: d.jobLeadId } });
      if (['SUBMITTED', 'APPLYING'].includes(lead.status)) leadNote = `Not attached: this job is already ${lead.status.toLowerCase()}`;
      else await this.autoApply.prepareKit(await this.prisma.jobLead.update({ where: { id: lead.id }, data: { resumeId: resume.id } }), userId);
    }
    const { storagePath: _, extractedText: __, ...rest } = resume;
    return { resume: rest, pages, leadNote };
  }

  /** Worker tick: approved jobs get their ATS check; jobs being tailored move on when their tailoring task ends. */
  async atsTick(now = new Date()) {
    let n = 0;
    for (const lead of await this.prisma.jobLead.findMany({ where: { status: 'APPROVED', atsStage: 'none' }, take: 10 })) {
      await this.check(lead).then(() => n++).catch((e) => this.log.warn(`ATS check ${lead.id}: ${(e as Error).message}`));
    }
    for (const lead of await this.prisma.jobLead.findMany({ where: { atsStage: 'tailoring' }, take: 10 })) {
      await this.advance(lead, now).then(() => n++).catch((e) => this.log.warn(`tailoring ${lead.id}: ${(e as Error).message}`));
    }
    return n;
  }

  private ready(lead: JobLead, score: number | null, missing: string[], note?: string) {
    return this.prisma.jobLead.update({ where: { id: lead.id }, data: { atsStage: 'ready', atsScore: score, atsMissing: missing, ...(note && { statusReason: note }) } });
  }

  private async check(lead: JobLead) {
    const cv = lead.resumeId ? await this.prisma.resumeDocument.findUnique({ where: { id: lead.resumeId }, select: { extractedText: true } }) : null;
    if (!cv?.extractedText?.trim()) return this.ready(lead, null, []);
    const a = atsScore(cv.extractedText, lead);
    if (a.score >= ATS_MIN) return this.ready(lead, a.score, a.missing);
    const why = `ATS ${a.score}/100 (below ${ATS_MIN})`;
    if (!lead.description?.trim()) return this.ready(lead, a.score, a.missing, `${why}; no job description to tailor to, applying with your current CV`);
    const master = await this.prisma.resumeDraft.findFirst({ where: { workspaceId: lead.workspaceId, applicationId: null, jobLeadId: null }, orderBy: { updatedAt: 'desc' } });
    if (!master) return this.ready(lead, a.score, a.missing, `${why}; no resume in the builder to tailor (create one in Resumes), applying with your current CV`);
    const draft = await this.prisma.resumeDraft.create({
      data: { workspaceId: lead.workspaceId, title: `${lead.company} – ${lead.title}`.slice(0, 120), content: master.content as Prisma.InputJsonValue, design: master.design as Prisma.InputJsonValue, sourceDraftId: master.id, jobLeadId: lead.id },
    });
    await this.tasks.create({ workspaceId: lead.workspaceId }, { type: 'resume_tailoring', title: `Tailor resume for ${draft.title}`, idempotencyKey: `resume_tailoring:${draft.id}`, input: { draftId: draft.id }, priority: 4 });
    await this.prisma.jobLead.update({ where: { id: lead.id }, data: { atsStage: 'tailoring', atsScore: a.score, atsMissing: a.missing, statusReason: `${why}: tailoring a CV for this job before applying` } });
  }

  private async advance(lead: JobLead, now: Date) {
    const draft = await this.prisma.resumeDraft.findFirst({ where: { jobLeadId: lead.id, sourceDraftId: { not: null } }, orderBy: { createdAt: 'desc' } });
    const task = draft && (await this.prisma.agentTask.findFirst({ where: { workspaceId: lead.workspaceId, idempotencyKey: `resume_tailoring:${draft.id}` } }));
    if (!draft || !task) return this.ready(lead, lead.atsScore, lead.atsMissing, 'Tailored CV not found, applying with your current CV');
    if (task.state === 'completed') {
      const fresh = await this.prisma.resumeDraft.findUniqueOrThrow({ where: { id: draft.id } });
      const { resume } = await this.publish(fresh);
      const a = atsScore(toPlainText(fresh.content as unknown as ResumeContent), lead);
      return this.ready(lead, a.score, a.missing, `Tailored CV "${resume.label}": ATS ${lead.atsScore ?? '?'} → ${a.score}/100`);
    }
    const stuck = ['failed', 'cancelled', 'ready_for_agent', 'awaiting_review'].includes(task.state) || now.getTime() - task.createdAt.getTime() > TAILOR_TIMEOUT_MS;
    if (stuck) return this.ready(lead, lead.atsScore, lead.atsMissing, `Tailoring did not finish (${task.state}), applying with your current CV`);
  }
}
