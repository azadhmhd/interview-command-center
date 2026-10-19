/**
 * Apply-kit builder (pure). Answers come ONLY from the candidate profile and the user's explicit standing answers.
 * Nothing is invented: unknown answers are left empty and marked for review. Consents, declarations and
 * demographic questions are answered only from an explicit standing decision. A kit is "complete" (safe to
 * auto-submit) only when every required field has a verified answer.
 */
import { z } from 'zod';
import type { AtsQuestion } from './sources';

export const standingAnswersSchema = z.object({
  fullName: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  linkedinUrl: z.string().url().max(500).optional(),
  githubUrl: z.string().url().max(500).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  currentLocation: z.string().max(120).optional(),
  noticePeriod: z.string().max(80).optional(),
  salaryExpectation: z.string().max(80).optional(),
  workAuthorization: z.string().max(200).optional(),
  requiresSponsorship: z.enum(['yes', 'no']).optional(),
  willingToRelocate: z.enum(['yes', 'no']).optional(),
  /** explicit decision for EEO / demographic questions; never inferred */
  demographics: z.enum(['decline', 'ask_me']).default('ask_me'),
  /** explicit consent to standard data-processing / privacy acknowledgements on application forms */
  consentToPrivacyNotices: z.boolean().default(false),
  /** explicit consent to "I certify the information is accurate" style declarations */
  consentToAccuracyDeclarations: z.boolean().default(false),
  /** user-defined answers: label contains `match` (case-insensitive) → `answer` */
  custom: z.array(z.object({ match: z.string().min(2).max(200), answer: z.string().max(2000) })).max(100).default([]),
});
export type StandingAnswers = z.infer<typeof standingAnswersSchema>;

export type AnswerSource = 'profile' | 'standing' | 'job' | 'ai' | 'user' | 'unknown';

export interface KitAnswer {
  key: string;
  label: string;
  required: boolean;
  type: string;
  answer: string;
  source: AnswerSource;
  needsReview: boolean;
  sensitive: boolean;
  options?: string[];
  note?: string;
}

export interface ApplyKit {
  coverNote: string;
  answers: KitAnswer[];
  missingRequired: string[];
  complete: boolean;
  /** open-ended questions an AI draft may fill (only when allowAiFreeText) */
  aiDraftKeys: string[];
}

/** Standard fields used when the ATS doesn't publish its questions (Lever, Ashby, manual URLs …). */
export const STANDARD_QUESTIONS: AtsQuestion[] = [
  { key: 'first_name', label: 'First Name', required: true, type: 'input_text' },
  { key: 'last_name', label: 'Last Name', required: true, type: 'input_text' },
  { key: 'email', label: 'Email', required: true, type: 'input_text' },
  { key: 'phone', label: 'Phone', required: false, type: 'input_text' },
  { key: 'resume', label: 'Resume/CV', required: true, type: 'input_file' },
  { key: 'linkedin', label: 'LinkedIn Profile', required: false, type: 'input_text' },
  { key: 'website', label: 'Website / Portfolio', required: false, type: 'input_text' },
  { key: 'cover_letter_text', label: 'Cover Letter', required: false, type: 'textarea' },
];

/** Field sets of ATS forms that don't publish their questions (as rendered on their hosted application pages). */
export function standardQuestionsFor(atsType: string): AtsQuestion[] {
  if (atsType === 'lever') return [
    { key: 'resume', label: 'Resume/CV', required: true, type: 'input_file' },
    { key: 'name', label: 'Full name', required: true, type: 'input_text' },
    { key: 'email', label: 'Email', required: true, type: 'input_text' },
    { key: 'phone', label: 'Phone', required: false, type: 'input_text' },
    { key: 'urls[LinkedIn]', label: 'LinkedIn URL', required: false, type: 'input_text' },
    { key: 'comments', label: 'Additional information', required: false, type: 'textarea' },
  ];
  if (atsType === 'ashby') return [
    { key: '_systemfield_name', label: 'Name', required: true, type: 'input_text' },
    { key: '_systemfield_email', label: 'Email', required: true, type: 'input_text' },
    { key: '_systemfield_resume', label: 'Resume', required: true, type: 'input_file' },
    { key: 'phone', label: 'Phone', required: false, type: 'input_text' },
    { key: 'linkedin', label: 'LinkedIn', required: false, type: 'input_text' },
  ];
  return STANDARD_QUESTIONS;
}

const SENSITIVE = /\b(gender|sex\b|race|ethnic|veteran|disabilit|pronoun|sexual orientation|religio|marital|age\b|date of birth|nationality|hispanic|latino)\b/i;
const CONSENT = /\b(privacy|consent|gdpr|data (protection|processing)|i agree|i acknowledge|terms|policy)\b/i;
const DECLARATION = /\b(certify|declare|attest|true and (complete|accurate)|accurate to the best)\b/i;
const OPEN_ENDED = /\b(why|tell us|describe|explain|what (excites|interests|motivates)|cover letter|additional information|anything else)\b/i;

export interface KitInput {
  title: string;
  company: string;
  sourceLabel: string;
  questions?: AtsQuestion[] | null;
  account: { name: string; email: string };
  profile: { fullName?: string | null; location?: string | null; yearsExperience?: number | null; noticePeriodDays?: number | null; headline?: string | null };
  standing: StandingAnswers;
  matchedSkills: string[];
  resumeLabel?: string;
  allowAiFreeText: boolean;
  /** AI-drafted answers for open-ended keys, already validated */
  aiAnswers?: Record<string, string>;
  aiCoverNote?: string;
}

function pickOption(answer: string, options?: string[]) {
  if (!options?.length) return { value: answer, ok: true };
  const a = answer.toLowerCase();
  const hit = options.find((o) => o.toLowerCase() === a) ?? options.find((o) => o.toLowerCase().startsWith(a) || a.startsWith(o.toLowerCase()))
    ?? options.find((o) => o.toLowerCase().includes(a));
  return hit ? { value: hit, ok: true } : { value: '', ok: false };
}

export function buildKit(input: KitInput): ApplyKit {
  const s = input.standing;
  const fullName = s.fullName ?? input.profile.fullName ?? input.account.name;
  const [first, ...rest] = fullName.trim().split(/\s+/);
  const answers: KitAnswer[] = [];
  const aiDraftKeys: string[] = [];

  for (const q of input.questions?.length ? input.questions : STANDARD_QUESTIONS) {
    const label = q.label ?? q.key;
    const L = `${label} ${q.key}`.toLowerCase();
    const sensitive = !!q.sensitive || SENSITIVE.test(label) || CONSENT.test(label) || DECLARATION.test(label);
    let answer = '';
    let source: AnswerSource = 'unknown';
    let note: string | undefined;
    const set = (v: string | undefined | null, src: AnswerSource) => { if (v) { answer = v; source = src; } };

    if (q.type === 'input_file' && /resume|cv/.test(L)) set(input.resumeLabel ? `Attach CV: ${input.resumeLabel}` : '', 'profile');
    else if (q.type === 'input_file' && /cover/.test(L)) set('', 'unknown');
    else if (/first.?name|given name/.test(L)) set(first, s.fullName ? 'standing' : 'profile');
    else if (/last.?name|surname|family name/.test(L)) set(rest.join(' '), s.fullName ? 'standing' : 'profile');
    else if ((/\b(full name|your name)\b/.test(L) || /^name$/i.test(label.trim())) && !/prefer/.test(L)) set(fullName, 'profile');
    else if (/prefer.*name/.test(L)) set(first, 'profile');
    else if (/e-?mail/.test(L)) set(s.email ?? input.account.email, s.email ? 'standing' : 'profile');
    else if (/phone|mobile/.test(L)) set(s.phone, 'standing');
    else if (/linkedin/.test(L)) set(s.linkedinUrl, 'standing');
    else if (/github/.test(L)) set(s.githubUrl, 'standing');
    else if (/website|portfolio|personal site/.test(L)) set(s.websiteUrl ?? s.githubUrl, 'standing');
    else if (/notice period|start date|available to start|earliest start/.test(L)) set(s.noticePeriod ?? (input.profile.noticePeriodDays != null ? `${input.profile.noticePeriodDays} days` : undefined), s.noticePeriod ? 'standing' : 'profile');
    else if (/salary|compensation|pay expectation|expected (ctc|package)/.test(L)) set(s.salaryExpectation, 'standing');
    else if (/sponsor/.test(L)) set(s.requiresSponsorship === undefined ? undefined : s.requiresSponsorship === 'yes' ? 'Yes' : 'No', 'standing');
    else if (/authori[sz]ed|right to work|work permit|visa status|eligible to work/.test(L)) set(s.workAuthorization, 'standing');
    else if (/relocat/.test(L)) set(s.willingToRelocate === undefined ? undefined : s.willingToRelocate === 'yes' ? 'Yes' : 'No', 'standing');
    else if (/(current )?(city|location)|where are you based/.test(L) && !SENSITIVE.test(label)) set(s.currentLocation ?? input.profile.location, s.currentLocation ? 'standing' : 'profile');
    else if (/how did you hear|where did you (find|hear)|source/.test(L)) set(input.sourceLabel, 'job');
    else if (/^total years|years of (professional |relevant )?experience/.test(L) && !/\bwith\b|\bin\b/.test(L)) set(input.profile.yearsExperience != null ? String(input.profile.yearsExperience) : undefined, 'profile');

    const custom = s.custom.find((c) => label.toLowerCase().includes(c.match.toLowerCase()));
    if (custom) { answer = custom.answer; source = 'standing'; }

    if (sensitive && !custom) {
      answer = ''; source = 'unknown';
      if (CONSENT.test(label) && s.consentToPrivacyNotices) { answer = 'Yes'; source = 'standing'; note = 'Your saved consent to privacy notices'; }
      else if (DECLARATION.test(label) && s.consentToAccuracyDeclarations) { answer = 'Yes'; source = 'standing'; note = 'Your saved accuracy declaration'; }
      else if ((SENSITIVE.test(label) || q.sensitive) && s.demographics === 'decline') {
        const opt = (q.options ?? []).find((o) => /decline|prefer not|do not wish|don't wish|not to (say|answer|disclose)/i.test(o));
        if (opt || !q.options?.length) { answer = opt ?? 'I prefer not to answer'; source = 'standing'; note = 'Your saved decision: decline demographic questions'; }
      }
      if (!answer) note = 'Sensitive question: answer it yourself or save a standing decision';
    }

    if (!answer && (OPEN_ENDED.test(label) || /cover_letter_text/.test(q.key)) && (q.type === 'textarea' || /cover/.test(L))) {
      const ai = input.aiAnswers?.[q.key];
      if (ai) { answer = ai; source = 'ai'; note = 'AI draft grounded in your profile; review recommended'; }
      else if (/cover/.test(L)) { answer = coverNote(input); source = 'profile'; note = 'Template cover note from your profile'; }
      else if (input.allowAiFreeText) { aiDraftKeys.push(q.key); note = 'Waiting for an AI draft'; }
    }

    let needsReview = false;
    if (answer && q.options?.length) {
      const p = pickOption(answer, q.options);
      if (!p.ok) { needsReview = true; note = `"${answer}" is not one of the options: ${q.options.slice(0, 6).join(' / ')}`; answer = ''; source = 'unknown'; }
      else answer = p.value;
    }
    if (source === 'ai' && !input.allowAiFreeText) needsReview = true;
    answers.push({ key: q.key, label, required: q.required, type: q.type, answer, source, needsReview: needsReview || (!answer && q.required), sensitive, options: q.options, note });
  }

  const missingRequired = answers.filter((a) => a.required && (!a.answer || a.needsReview)).map((a) => a.label);
  return { coverNote: input.aiCoverNote ?? coverNote(input), answers, missingRequired, complete: missingRequired.length === 0 && aiDraftKeys.every((k) => !answers.find((a) => a.key === k)?.required), aiDraftKeys };
}

/** Template cover note using only profile facts (no invented claims). */
export function coverNote(i: Pick<KitInput, 'title' | 'company' | 'profile' | 'matchedSkills' | 'account' | 'standing'>): string {
  const name = i.standing.fullName ?? i.profile.fullName ?? i.account.name;
  const exp = i.profile.yearsExperience ? `${i.profile.yearsExperience}+ years of experience` : 'my experience';
  const skills = i.matchedSkills.length ? ` working with ${i.matchedSkills.slice(0, 5).join(', ')}` : '';
  return `Dear ${i.company} hiring team,\n\nI'm applying for the ${i.title} role. I bring ${exp}${skills}${i.profile.headline ? ` as a ${i.profile.headline}` : ''}, and I'd welcome the chance to discuss how I can contribute.\n\nKind regards,\n${name}`;
}
