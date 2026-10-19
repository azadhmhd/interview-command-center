import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApplyAttemptStatus, JobLead, JobLeadStatus, JobSource, JobSourceType, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { dedupeKey } from '../applications/applications';
import { AuditService } from '../common/audit.service';
import { newToken, sha256 } from '../common/crypto';
import type { Ctx } from '../common/http';
import { config } from '../config';
import { LlmService } from '../llm/llm.service';
import { detectTech } from '../profile/profile';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { ApplyKit, buildKit, KitAnswer, standardQuestionsFor, standingAnswersSchema, StandingAnswers } from './kit';
import { CandidateFacts, DEFAULT_PREFERENCES, Preferences, scoreJob, selectResume } from './matching';
import { ADAPTERS, fetchQuestions, NormalizedJob, parseAlertEmail, SourceError } from './sources';
import { AUTOMATABLE_ATS, canMove, preferencesSchema, RESCORABLE } from './state';

type Owner = Pick<Ctx, 'workspaceId'> & { userId?: string };

const LEASE_MS = 10 * 60_000;
const ATTEMPT_LEASE_MS = 15 * 60_000;
const MAX_APPLY_ATTEMPTS = 3;
const CONFIRM_TEXT = /\b(thank(s| you)|application (has been |was )?(received|submitted|sent)|we('ve| have) received|successfully (submitted|applied)|submission (received|complete))\b/i;
const CONFIRM_URL = /(confirm|thank|success|submitted|applied)/i;
/** attempts that submitted, or clicked Submit and were not explicitly cleared by the user */
const CLICKED = { OR: [{ status: 'SUBMITTED' as const }, { submitClickedAt: { not: null }, status: { not: 'CANCELLED' as const } }] };

export const evidenceSchema = z.object({
  confirmationUrl: z.string().url().max(2000).optional(),
  confirmationText: z.string().max(4000).optional(),
  /** base64 PNG from the runner (≤ 3 MB) */
  screenshotBase64: z.string().max(4_200_000).optional(),
  note: z.string().max(2000).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** A submission counts only with a confirmation page/text the runner saw, or an explicit user attestation. */
export function verifyEvidence(e: Evidence | undefined, manual = false): { ok: boolean; reason?: string } {
  if (!e) return { ok: false, reason: 'No evidence provided' };
  if (manual) return e.note || e.confirmationText || e.confirmationUrl ? { ok: true } : { ok: false, reason: 'Describe how you applied (or paste the confirmation)' };
  if (e.confirmationText && CONFIRM_TEXT.test(e.confirmationText)) return { ok: true };
  if (e.confirmationUrl && CONFIRM_URL.test(new URL(e.confirmationUrl).pathname + new URL(e.confirmationUrl).search)) return { ok: true };
  return { ok: false, reason: 'No confirmation page detected after submit' };
}

@Injectable()
export class AutoApplyService {
  private log = new Logger('AutoApply');
  constructor(private prisma: PrismaService, private tasks: TasksService, private llm: LlmService, private audit: AuditService) {}

  // ───────────── config & facts ─────────────

  async config(workspaceId: string) {
    const row = await this.prisma.autoApplyConfig.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
    const prefs = preferencesSchema.safeParse(row.preferences);
    const standing = standingAnswersSchema.safeParse(row.standingAnswers);
    return {
      ...row,
      preferences: (prefs.success ? prefs.data : DEFAULT_PREFERENCES) as Preferences,
      standingAnswers: (standing.success ? standing.data : standingAnswersSchema.parse({})) as StandingAnswers,
    };
  }

  private async facts(workspaceId: string): Promise<CandidateFacts & { profile: Awaited<ReturnType<PrismaService['candidateProfile']['findUnique']>> }> {
    const [profile, resumes] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { workspaceId } }),
      this.prisma.resumeDocument.findMany({ where: { workspaceId }, select: { extractedText: true } }),
    ]);
    const confirmed = (profile?.confirmedFacts as { skills?: string[] } | null)?.skills ?? [];
    return {
      profile, coreTech: profile?.coreTech ?? [], targetRoles: profile?.targetRoles ?? [], yearsExperience: profile?.yearsExperience,
      extraSkills: [...new Set([...confirmed, ...resumes.flatMap((r) => detectTech(r.extractedText ?? ''))])],
    };
  }

  // ───────────── discovery ─────────────

  /** Run one source. A lease prevents overlapping runs; failures are recorded without affecting other sources. */
  async runSource(source: JobSource): Promise<{ found: number; created: number; error?: string; skipped?: boolean }> {
    const now = new Date();
    const leased = await this.prisma.jobSource.updateMany({
      where: { id: source.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil: new Date(now.getTime() + LEASE_MS), lastRunAt: now },
    });
    if (!leased.count) return { found: 0, created: 0, skipped: true };
    try {
      const adapter = ADAPTERS[source.type];
      if (!adapter) throw new SourceError(`${source.type} sources are import-only`, false);
      const jobs = await adapter(source.config as unknown as { board: string; company?: string; baseUrl?: string });
      let created = 0;
      for (const job of jobs) {
        try {
          if ((await this.ingest({ workspaceId: source.workspaceId }, job, source.name, source.type, source.id)).created) created++;
        } catch (e) {
          this.log.warn(`ingest failed (${source.name}): ${(e as Error).message}`);
        }
      }
      await this.prisma.jobSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), lastError: null, lastFoundCount: jobs.length, leaseUntil: null } });
      return { found: jobs.length, created };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await this.prisma.jobSource.update({ where: { id: source.id }, data: { lastError: msg, leaseUntil: null } });
      return { found: 0, created: 0, error: msg };
    }
  }

  /** Normalise + dedupe one job into a lead, then evaluate it. Re-discoveries update history, never duplicate. */
  async ingest(owner: Owner, job: NormalizedJob, via: string, sourceType: JobSourceType, sourceId?: string): Promise<{ lead: JobLead; created: boolean }> {
    if (!job.title?.trim() || !job.company?.trim() || !job.canonicalUrl) throw new BadRequestException('Job needs a title, company and URL');
    const key = dedupeKey(job.company, job.title);
    const existing = await this.prisma.jobLead.findUnique({ where: { workspaceId_dedupeKey: { workspaceId: owner.workspaceId, dedupeKey: key } } });
    let lead: JobLead;
    let created = false;
    const fields = {
      externalId: job.externalId, location: job.location, remote: job.remote, employmentType: job.employmentType, salaryMin: job.salaryMin != null ? Math.round(job.salaryMin) : undefined,
      salaryMax: job.salaryMax != null ? Math.round(job.salaryMax) : undefined, salaryCurrency: job.salaryCurrency, salaryPeriod: job.salaryPeriod, publishedAt: job.publishedAt,
      applyUrl: job.applyUrl, atsType: job.atsType, atsMeta: job.atsMeta as Prisma.InputJsonValue | undefined,
    };
    if (existing) {
      lead = await this.prisma.jobLead.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(), seenCount: { increment: 1 }, discoveredVia: existing.discoveredVia.includes(via) ? undefined : { push: via },
          // fill gaps only; never overwrite what is already known
          ...Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && (existing as Record<string, unknown>)[k] == null)),
          ...(!existing.description && job.description && { description: job.description }),
          ...(existing.atsType === 'other' && job.atsType !== 'other' && { atsType: job.atsType, atsMeta: job.atsMeta as Prisma.InputJsonValue, applyUrl: job.applyUrl }),
        },
      });
    } else {
      try {
        lead = await this.prisma.jobLead.create({
          data: {
            workspaceId: owner.workspaceId, sourceId, sourceType, canonicalUrl: job.canonicalUrl, title: job.title.trim().slice(0, 300), company: job.company.trim().slice(0, 200),
            description: job.description ?? '', dedupeKey: key, discoveredVia: [via], ...fields,
          },
        });
        created = true;
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
        return this.ingest(owner, job, via, sourceType, sourceId); // concurrent insert of the same job
      }
    }
    for (const email of job.contactEmails ?? []) await this.upsertRecruiter(owner.workspaceId, { email, company: job.company, source: 'job_post', leadId: lead.id });
    // evaluate new jobs, or known ones that just gained a description; unchanged re-discoveries are left as they are
    const gainedDescription = !!existing && !existing.description && !!job.description;
    if ((created || gainedDescription || existing?.fitScore == null) && RESCORABLE.includes(lead.status)) lead = await this.evaluate(lead, owner.userId);
    return { lead, created };
  }

  // ───────────── matching & kit ─────────────

  async evaluate(lead: JobLead, userId?: string): Promise<JobLead> {
    const [cfg, facts, resumes] = await Promise.all([
      this.config(lead.workspaceId), this.facts(lead.workspaceId),
      this.prisma.resumeDocument.findMany({ where: { workspaceId: lead.workspaceId }, select: { id: true, label: true, version: true, isDefault: true, extractedText: true } }),
    ]);
    const m = scoreJob(lead, cfg.preferences, facts);
    const cv = selectResume(lead, resumes);
    const shortlisted = !m.blockers.length && m.score >= cfg.minShortlistScore;
    let updated = await this.prisma.jobLead.update({
      where: { id: lead.id },
      data: {
        fitScore: m.score, fitBreakdown: { ...m.breakdown, matchedSkills: m.matchedSkills, missingSkills: m.missingSkills, resumeReason: cv.reason } as unknown as Prisma.InputJsonValue,
        fitExplanation: m.explanation, blockers: m.blockers, resumeId: lead.resumeId ?? cv.resumeId ?? null,
        status: shortlisted ? 'SHORTLISTED' : 'EVALUATED', statusReason: shortlisted ? null : m.blockers[0] ?? `Score ${m.score} below your shortlist threshold (${cfg.minShortlistScore})`,
      },
    });
    if (shortlisted) {
      if (lead.description && (await this.llm.status(lead.workspaceId)).available) {
        await this.tasks.create({ workspaceId: lead.workspaceId, userId }, {
          type: 'job_match', title: `Fit review: ${lead.title} at ${lead.company}`, idempotencyKey: `job_match:${lead.id}:${sha256(lead.description).slice(0, 16)}`,
          input: { leadId: lead.id }, priority: 6,
        });
      }
      updated = await this.prepareKit(updated, userId);
    }
    return updated;
  }

  /** Build the apply kit; shortlisted leads move to READY_FOR_REVIEW, then auto-approve if every guardrail passes. */
  async prepareKit(lead: JobLead, userId?: string, edits?: { answers?: Record<string, string>; coverNote?: string }): Promise<JobLead> {
    const [cfg, facts, user, resume] = await Promise.all([
      this.config(lead.workspaceId), this.facts(lead.workspaceId),
      userId ? this.prisma.user.findUnique({ where: { id: userId } }) : this.ownerOf(lead.workspaceId),
      lead.resumeId ? this.prisma.resumeDocument.findUnique({ where: { id: lead.resumeId } }) : null,
    ]);
    let questions = null;
    try { questions = await fetchQuestions(lead.atsType, lead.atsMeta as Record<string, string> | null); } catch (e) { this.log.warn(`questions unavailable for ${lead.id}: ${(e as Error).message}`); }
    const prev = lead.applyKit as unknown as (ApplyKit & { aiAnswers?: Record<string, string>; userAnswers?: Record<string, string>; aiCoverNote?: string }) | null;
    const userAnswers = { ...(prev?.userAnswers ?? {}), ...(edits?.answers ?? {}) };
    const kit = buildKit({
      title: lead.title, company: lead.company, sourceLabel: lead.discoveredVia[0] ?? 'Company careers page', questions: questions ?? standardQuestionsFor(lead.atsType),
      account: { name: user?.name ?? '', email: user?.email ?? '' }, profile: facts.profile ?? {}, standing: cfg.standingAnswers,
      matchedSkills: ((lead.fitBreakdown as { matchedSkills?: string[] } | null)?.matchedSkills) ?? [], resumeLabel: resume ? `${resume.label} v${resume.version} (${resume.fileName})` : undefined,
      allowAiFreeText: cfg.allowAiFreeText, aiAnswers: prev?.aiAnswers, aiCoverNote: edits?.coverNote ?? prev?.aiCoverNote,
    });
    // the user's own edits win over everything else
    for (const a of kit.answers) {
      const v = userAnswers[a.key];
      if (v !== undefined) Object.assign(a, { answer: v, source: 'user' as KitAnswer['source'], needsReview: a.required && !v, note: 'Your answer' });
    }
    kit.missingRequired = kit.answers.filter((a) => a.required && (!a.answer || a.needsReview)).map((a) => a.label);
    kit.complete = kit.missingRequired.length === 0;
    if (edits?.coverNote) kit.coverNote = edits.coverNote;
    const next: JobLeadStatus = ['SHORTLISTED', 'EVALUATED'].includes(lead.status) ? 'READY_FOR_REVIEW' : lead.status;
    let updated = await this.prisma.jobLead.update({
      where: { id: lead.id },
      data: {
        applyKit: { ...kit, aiAnswers: prev?.aiAnswers ?? {}, userAnswers, aiCoverNote: edits?.coverNote ?? prev?.aiCoverNote, questionsFrom: questions ? 'ats' : 'standard' } as unknown as Prisma.InputJsonValue,
        kitStatus: kit.complete ? 'complete' : 'incomplete', status: next,
        statusReason: next === 'READY_FOR_REVIEW' ? (kit.complete ? 'Apply kit complete' : `Missing: ${kit.missingRequired.slice(0, 4).join(', ')}`) : lead.statusReason,
      },
    });
    if (kit.aiDraftKeys.length && (await this.llm.status(lead.workspaceId)).available) {
      await this.tasks.create({ workspaceId: lead.workspaceId, userId }, {
        type: 'apply_answers', title: `Draft application answers: ${lead.title} at ${lead.company}`, idempotencyKey: `apply_answers:${lead.id}:${kit.aiDraftKeys.join(',')}`,
        input: { leadId: lead.id, keys: kit.aiDraftKeys }, priority: 4,
      });
    }
    updated = await this.autoApprove(updated);
    return updated;
  }

  private async ownerOf(workspaceId: string) {
    const m = await this.prisma.workspaceMembership.findFirst({ where: { workspaceId, role: 'OWNER' }, include: { user: true } });
    return m?.user ?? null;
  }

  /** Why a lead must not be applied to again (internal history: attempts and the existing tracker). */
  async duplicateReason(lead: Pick<JobLead, 'id' | 'workspaceId' | 'dedupeKey' | 'trackerApplicationId'>): Promise<string | null> {
    // Any attempt that ever clicked Submit counts until the user explicitly verifies it did not go through.
    const done = await this.prisma.applyAttempt.findFirst({ where: { leadId: lead.id, ...CLICKED } });
    if (done) return done.status === 'SUBMITTED' ? 'Already submitted for this job' : 'A previous attempt clicked Submit; verify it before retrying';
    const tracked = await this.prisma.application.findFirst({ where: { workspaceId: lead.workspaceId, dedupeKey: lead.dedupeKey, status: { not: 'Saved' }, NOT: lead.trackerApplicationId ? { id: lead.trackerApplicationId } : undefined } });
    return tracked ? `Already in your tracker (${tracked.status})` : null;
  }

  private async appliesToday(workspaceId: string) {
    return this.prisma.applyAttempt.count({ where: { workspaceId, method: { in: ['AUTO', 'AGENT'] }, status: { in: ['SUBMITTED', 'SUBMIT_CLICKED'] }, submitClickedAt: { gte: new Date(Date.now() - 864e5) } } });
  }

  /** Auto mode: approve without a stop only when every guardrail passes. */
  async autoApprove(lead: JobLead): Promise<JobLead> {
    const cfg = await this.config(lead.workspaceId);
    if (!cfg.autoSubmit || lead.status !== 'READY_FOR_REVIEW' || lead.kitStatus !== 'complete' || lead.blockers.length) return lead;
    if ((lead.fitScore ?? 0) < cfg.minAutoApplyScore || !AUTOMATABLE_ATS.includes(lead.atsType)) return lead;
    if (await this.duplicateReason(lead)) return lead;
    return this.prisma.jobLead.update({ where: { id: lead.id }, data: { status: 'APPROVED', autoApproved: true, statusReason: 'Auto-approved: score, kit and guardrails passed' } });
  }

  async rescoreAll(workspaceId: string, userId?: string) {
    const leads = await this.prisma.jobLead.findMany({ where: { workspaceId, status: { in: RESCORABLE } }, take: 2000 });
    for (const l of leads) await this.evaluate(l, userId);
    return leads.length;
  }

  // ───────────── user actions ─────────────

  async lead(ctx: Owner, id: string) {
    const l = await this.prisma.jobLead.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!l) throw new NotFoundException('Job not found');
    return l;
  }

  async setStatus(ctx: Ctx, id: string, to: JobLeadStatus, reason?: string, verifiedNotSubmitted = false) {
    const l = await this.lead(ctx, id);
    if (verifiedNotSubmitted) {
      // the user checked the site: an earlier "Submit clicked" did not produce an application
      const cleared = await this.prisma.applyAttempt.updateMany({ where: { leadId: id, status: { notIn: ['SUBMITTED', 'CANCELLED'] }, submitClickedAt: { not: null } }, data: { status: 'CANCELLED', error: 'User verified this attempt was not submitted' } });
      if (cleared.count) await this.audit.record(ctx, 'autoapply.verified_not_submitted', { type: 'job_lead', id }, { attempts: cleared.count });
    }
    if (to === 'SUBMITTED') throw new BadRequestException('Use "Mark as submitted" with evidence');
    if (to === 'APPLYING') throw new BadRequestException('Only the apply runner moves a job to Applying');
    if (!canMove(l.status, to)) throw new BadRequestException(`Cannot move from ${l.status} to ${to}`);
    if (to === 'APPROVED') {
      const dup = await this.duplicateReason(l);
      if (dup) throw new ConflictException(dup);
    }
    const updated = await this.prisma.jobLead.update({ where: { id }, data: { status: to, statusReason: reason ?? null, ...(to === 'APPROVED' && { autoApproved: false }) } });
    await this.audit.record(ctx, `autoapply.status.${to.toLowerCase()}`, { type: 'job_lead', id });
    return updated;
  }

  async markSubmitted(ctx: Ctx, id: string, evidence: Evidence) {
    const l = await this.lead(ctx, id);
    if (!canMove(l.status, 'SUBMITTED')) throw new BadRequestException(`Cannot mark a ${l.status} job as submitted`);
    const v = verifyEvidence(evidence, true);
    if (!v.ok) throw new BadRequestException(v.reason);
    if (await this.prisma.applyAttempt.findFirst({ where: { leadId: id, status: 'SUBMITTED' } })) throw new ConflictException('Already marked as submitted');
    const attemptNo = (await this.prisma.applyAttempt.count({ where: { leadId: id } })) + 1;
    await this.prisma.$transaction([
      this.prisma.applyAttempt.create({ data: { workspaceId: ctx.workspaceId, leadId: id, attemptNo, method: 'MANUAL', status: 'SUBMITTED', evidence: { ...evidence, attestedBy: ctx.userId } as Prisma.InputJsonValue, submitClickedAt: new Date(), finishedAt: new Date() } }),
      this.prisma.jobLead.update({ where: { id }, data: { status: 'SUBMITTED', statusReason: 'Submitted manually' } }),
    ]);
    await this.audit.record(ctx, 'autoapply.submitted_manual', { type: 'job_lead', id });
    return this.lead(ctx, id);
  }

  /** Explicit, user-initiated copy into the existing tracker (the only bridge between the two sections). */
  async moveToTracker(ctx: Ctx, id: string) {
    const l = await this.lead(ctx, id);
    if (l.trackerApplicationId) return { applicationId: l.trackerApplicationId, existing: true };
    const found = await this.prisma.application.findFirst({ where: { workspaceId: ctx.workspaceId, dedupeKey: l.dedupeKey } });
    const app = found ?? await this.prisma.application.create({
      data: {
        workspaceId: ctx.workspaceId, companyName: l.company, jobTitle: l.title, location: l.location, jobDescription: l.description || null, jobUrl: l.canonicalUrl,
        source: `Auto Apply · ${l.discoveredVia[0] ?? l.sourceType}`, resumeId: l.resumeId, dedupeKey: l.dedupeKey,
        status: ['SUBMITTED', 'INTERVIEW'].includes(l.status) ? 'Applied' : 'Saved', appliedAt: l.status === 'SUBMITTED' ? new Date() : undefined,
        activities: { create: { workspaceId: ctx.workspaceId, type: 'created', message: `Moved from Auto Apply (fit ${l.fitScore ?? '?'}/100)`, actorId: ctx.userId } },
      },
    });
    await this.prisma.jobLead.update({ where: { id }, data: { trackerApplicationId: app.id } });
    await this.audit.record(ctx, 'autoapply.moved_to_tracker', { type: 'job_lead', id }, { applicationId: app.id });
    return { applicationId: app.id, existing: !!found };
  }

  async importAlert(ctx: Ctx, content: string) {
    const { jobs, sender } = parseAlertEmail(content);
    const results = [];
    for (const j of jobs) results.push(await this.ingest(ctx, j, `alert:${j.atsType}`, 'ALERT_EMAIL'));
    let recruiter = null;
    if (sender?.email && !/no-?reply|jobalerts|jobs-noreply|notification|alerts?@/i.test(sender.email)) {
      recruiter = await this.upsertRecruiter(ctx.workspaceId, { email: sender.email, name: sender.name, source: 'alert_email', company: jobs[0]?.company });
    }
    return { found: jobs.length, created: results.filter((r) => r.created).length, leads: results.map((r) => ({ id: r.lead.id, title: r.lead.title, company: r.lead.company, status: r.lead.status, fitScore: r.lead.fitScore })), recruiter };
  }

  // ───────────── apply runner protocol ─────────────

  /** Claim the best approved, automatable job. Conditional update = only one runner can claim a job. */
  async claim(ctx: Ctx, runner: string) {
    const cfg = await this.config(ctx.workspaceId);
    const candidates = await this.prisma.jobLead.findMany({
      where: { workspaceId: ctx.workspaceId, status: 'APPROVED', atsType: { in: AUTOMATABLE_ATS }, applyUrl: { not: null } },
      orderBy: [{ fitScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'asc' }], take: 20,
    });
    for (const lead of candidates) {
      const dup = await this.duplicateReason(lead);
      if (dup) { await this.prisma.jobLead.update({ where: { id: lead.id }, data: { status: 'NEEDS_ATTENTION', statusReason: dup } }); continue; }
      const mode = cfg.autoSubmit ? 'auto' : 'prefill';
      if (mode === 'auto' && (await this.appliesToday(ctx.workspaceId)) >= cfg.dailyApplyCap) return { attempt: null, reason: `Daily cap of ${cfg.dailyApplyCap} automatic applications reached` };
      const won = await this.prisma.jobLead.updateMany({ where: { id: lead.id, status: 'APPROVED' }, data: { status: 'APPLYING', statusReason: `Runner ${runner} is applying` } });
      if (!won.count) continue;
      const attemptNo = (await this.prisma.applyAttempt.count({ where: { leadId: lead.id } })) + 1;
      const attempt = await this.prisma.applyAttempt.create({
        data: { workspaceId: ctx.workspaceId, leadId: lead.id, attemptNo, method: mode === 'auto' ? 'AUTO' : 'PREFILL', runner, leaseUntil: new Date(Date.now() + ATTEMPT_LEASE_MS) },
      });
      const resume = lead.resumeId ? await this.prisma.resumeDocument.findUnique({ where: { id: lead.resumeId }, select: { id: true, fileName: true, mimeType: true } }) : null;
      return { attempt: { id: attempt.id, attemptNo }, mode, lead: { id: lead.id, title: lead.title, company: lead.company, applyUrl: lead.applyUrl, atsType: lead.atsType, kit: lead.applyKit, resume } };
    }
    return { attempt: null, reason: 'Nothing approved to apply to' };
  }

  private async attempt(ctx: Ctx, id: string) {
    const a = await this.prisma.applyAttempt.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { lead: true } });
    if (!a) throw new NotFoundException('Attempt not found');
    return a;
  }

  async heartbeat(ctx: Ctx, id: string) {
    const a = await this.attempt(ctx, id);
    if (!['RUNNING', 'SUBMIT_CLICKED'].includes(a.status)) throw new ConflictException(`Attempt is ${a.status}`);
    await this.prisma.applyAttempt.update({ where: { id }, data: { leaseUntil: new Date(Date.now() + ATTEMPT_LEASE_MS) } });
    return { ok: true };
  }

  /**
   * MUST be called right before clicking Submit. Records SUBMIT_CLICKED first, so a crash or retry can never submit
   * twice: any later attempt sees the clicked state and stops for verification.
   */
  async submitIntent(ctx: Ctx, id: string) {
    const a = await this.attempt(ctx, id);
    if (a.status !== 'RUNNING' || a.lead.status !== 'APPLYING') return { ok: false, reason: `Attempt is ${a.status}, job is ${a.lead.status}` };
    const other = await this.prisma.applyAttempt.findFirst({ where: { leadId: a.leadId, id: { not: id }, ...CLICKED } });
    if (other) return { ok: false, reason: 'Another attempt already submitted or clicked Submit' };
    const cfg = await this.config(ctx.workspaceId);
    if (a.method === 'AUTO' && !cfg.autoSubmit) return { ok: false, reason: 'Auto-submit was turned off' };
    const r = await this.prisma.applyAttempt.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'SUBMIT_CLICKED', submitClickedAt: new Date() } });
    return r.count ? { ok: true } : { ok: false, reason: 'Attempt changed concurrently' };
  }

  async reportResult(ctx: Ctx, id: string, body: { status: 'SUBMITTED' | 'BLOCKED' | 'NEEDS_ATTENTION' | 'FAILED'; evidence?: Evidence; filledFields?: unknown; missingFields?: string[]; error?: string }) {
    const a = await this.attempt(ctx, id);
    if (!['RUNNING', 'SUBMIT_CLICKED'].includes(a.status)) throw new ConflictException(`Attempt already finished (${a.status})`);
    let status: ApplyAttemptStatus = body.status;
    let reason = body.error;
    let screenshot: string | undefined;
    if (body.evidence?.screenshotBase64) {
      // filename from the database id (not the request), format-checked, and confined to the workspace upload dir
      if (!/^[a-z0-9]{10,40}$/.test(a.id) || !/^[a-z0-9]{10,40}$/.test(a.workspaceId)) throw new BadRequestException('Invalid attempt');
      const dir = resolve(config.uploadDir, a.workspaceId);
      const file = resolve(dir, `apply-${a.id}.png`);
      if (!dir.startsWith(resolve(config.uploadDir) + sep) || !file.startsWith(dir + sep)) throw new BadRequestException('Invalid screenshot path');
      await mkdir(dir, { recursive: true });
      await writeFile(file, Buffer.from(body.evidence.screenshotBase64, 'base64'), { mode: 0o600 });
      screenshot = `apply-${a.id}.png`;
    }
    if (status === 'SUBMITTED') {
      if (a.status !== 'SUBMIT_CLICKED') { status = 'NEEDS_ATTENTION'; reason = 'Submit was reported without the submit-intent check'; }
      const v = verifyEvidence(body.evidence);
      if (!v.ok) { status = 'NEEDS_ATTENTION'; reason = `${v.reason}: open the job and confirm whether it went through`; }
    } else if (a.status === 'SUBMIT_CLICKED' && status === 'FAILED') {
      status = 'NEEDS_ATTENTION'; reason = `Error after clicking Submit (${body.error ?? 'unknown'}): verify manually; it will not be retried`;
    }
    const { screenshotBase64: _, ...evidence } = body.evidence ?? {};
    const retry = status === 'FAILED' && a.attemptNo < MAX_APPLY_ATTEMPTS;
    const leadStatus: JobLeadStatus = status === 'SUBMITTED' ? 'SUBMITTED' : retry ? 'APPROVED' : 'NEEDS_ATTENTION';
    await this.prisma.$transaction([
      this.prisma.applyAttempt.update({
        where: { id },
        data: { status, error: reason?.slice(0, 2000), evidence: { ...evidence, ...(screenshot && { screenshot }) } as Prisma.InputJsonValue, filledFields: body.filledFields as Prisma.InputJsonValue, missingFields: body.missingFields ?? [], finishedAt: new Date(), leaseUntil: null },
      }),
      this.prisma.jobLead.update({
        where: { id: a.leadId },
        data: { status: leadStatus, statusReason: status === 'SUBMITTED' ? `Submitted (${a.method.toLowerCase()})` : retry ? `Retrying: ${reason ?? 'runner failed'}` : status === 'BLOCKED' ? `Blocked: ${reason ?? 'needs a human'}` : reason ?? 'Needs attention' },
      }),
    ]);
    await this.audit.record(ctx, `autoapply.attempt.${status.toLowerCase()}`, { type: 'job_lead', id: a.leadId }, { attemptId: id, method: a.method });
    return { status, leadStatus, reason };
  }

  /** Worker tick: crashed runners. A crash after Submit is never retried automatically. */
  async recoverStale(now = new Date()) {
    const stale = await this.prisma.applyAttempt.findMany({ where: { status: { in: ['RUNNING', 'SUBMIT_CLICKED'] }, leaseUntil: { lt: now } }, take: 50 });
    for (const a of stale) {
      const clicked = a.status === 'SUBMIT_CLICKED';
      const retry = !clicked && a.attemptNo < MAX_APPLY_ATTEMPTS;
      const r = await this.prisma.applyAttempt.updateMany({ where: { id: a.id, status: a.status }, data: { status: clicked ? 'NEEDS_ATTENTION' : 'FAILED', error: clicked ? 'Runner stopped after clicking Submit: verify whether the application went through' : 'Runner stopped responding', finishedAt: now, leaseUntil: null } });
      if (r.count) await this.prisma.jobLead.updateMany({ where: { id: a.leadId, status: 'APPLYING' }, data: { status: retry ? 'APPROVED' : 'NEEDS_ATTENTION', statusReason: clicked ? 'Possible submission: verify on the site' : retry ? 'Retrying after runner timeout' : 'Runner timed out repeatedly' } });
    }
    return stale.length;
  }

  /** Worker tick: sources due for a scan (per workspace interval). */
  async discoverDue(now = new Date()) {
    const sources = await this.prisma.jobSource.findMany({ where: { enabled: true, type: { in: Object.keys(ADAPTERS) as JobSourceType[] } }, include: { workspace: { include: { autoApplyConfig: true } } }, take: 100 });
    let ran = 0;
    for (const s of sources) {
      const hours = s.workspace.autoApplyConfig?.discoveryHours ?? 12;
      if (s.lastRunAt && now.getTime() - s.lastRunAt.getTime() < hours * 36e5) continue;
      await this.runSource(s);
      ran++;
    }
    return ran;
  }

  // ───────────── recruiters ─────────────

  async upsertRecruiter(workspaceId: string, r: { email?: string; name?: string; company?: string; title?: string; phone?: string; linkedinUrl?: string; source: string; leadId?: string; notes?: string }) {
    const email = r.email?.toLowerCase().trim();
    if (!email) return this.prisma.recruiterContact.create({ data: { workspaceId, ...r, email: null } });
    return this.prisma.recruiterContact.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: { workspaceId, ...r, email },
      update: Object.fromEntries(Object.entries({ name: r.name, company: r.company, title: r.title, phone: r.phone, linkedinUrl: r.linkedinUrl, leadId: r.leadId }).filter(([, v]) => v)),
    });
  }

  // ───────────── runner tokens (long-lived sessions for the local apply runner) ─────────────

  async createRunnerToken(ctx: Ctx, label: string) {
    const token = newToken();
    const s = await this.prisma.session.create({ data: { userId: ctx.userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 180 * 864e5), userAgent: `icc-apply-runner:${label.slice(0, 60)}`, ip: ctx.ip } });
    await this.audit.record(ctx, 'autoapply.runner_token_created', { type: 'session', id: s.id });
    return { id: s.id, token, expiresAt: s.expiresAt };
  }
}
