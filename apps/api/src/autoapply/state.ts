import { JobLeadStatus } from '@prisma/client';
import { z } from 'zod';
import { SITES } from './search';

/** Allowed lead transitions. SUBMITTED is only reachable with verified evidence (enforced in the service). */
const T: Record<JobLeadStatus, JobLeadStatus[]> = {
  DISCOVERED: ['EVALUATED', 'SHORTLISTED', 'SKIPPED'],
  EVALUATED: ['SHORTLISTED', 'READY_FOR_REVIEW', 'APPROVED', 'SKIPPED'],
  SHORTLISTED: ['EVALUATED', 'READY_FOR_REVIEW', 'APPROVED', 'SKIPPED'],
  READY_FOR_REVIEW: ['SHORTLISTED', 'APPROVED', 'SKIPPED', 'NEEDS_ATTENTION'],
  APPROVED: ['READY_FOR_REVIEW', 'APPLYING', 'SUBMITTED', 'NEEDS_ATTENTION', 'SKIPPED'],
  APPLYING: ['APPROVED', 'SUBMITTED', 'NEEDS_ATTENTION'],
  NEEDS_ATTENTION: ['READY_FOR_REVIEW', 'APPROVED', 'SUBMITTED', 'SKIPPED', 'WITHDRAWN'],
  SUBMITTED: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  WITHDRAWN: [],
  SKIPPED: ['EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW'],
};

export const canMove = (from: JobLeadStatus, to: JobLeadStatus) => from === to || T[from].includes(to);

/** Statuses whose score / kit may be recomputed automatically (never touches anything the user acted on). */
export const RESCORABLE: JobLeadStatus[] = ['DISCOVERED', 'EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW'];

/** ATS forms the apply runner can drive. Everything else gets the apply kit for a manual submission. */
export const AUTOMATABLE_ATS = ['greenhouse', 'lever', 'ashby'];

export const preferencesSchema = z.object({
  titles: z.array(z.string().max(100)).max(40).default([]),
  locations: z.array(z.string().max(100)).max(40).default([]),
  keywords: z.array(z.string().max(60)).max(80).default([]),
  excludeKeywords: z.array(z.string().max(60)).max(80).default([]),
  languages: z.array(z.string().max(40)).max(20).default(['English']),
  minSalary: z.number().int().min(0).max(10_000_000).optional(),
  salaryCurrency: z.string().length(3).optional(),
  salaryPeriod: z.enum(['year', 'month']).optional(),
  remoteOk: z.boolean().default(true),
  maxAgeDays: z.number().int().min(1).max(365).default(45),
  // where the search providers look: role × search location queries, country, and which sites you accept
  searchLocations: z.array(z.string().max(100)).max(10).default([]),
  searchCountry: z.string().regex(/^[a-z]{2}$/).default('ae'),
  sites: z.array(z.enum(SITES)).default([...SITES]),
  maxSearchQueries: z.number().int().min(1).max(30).default(6),
});

/** Example preset offered in the UI; users edit everything. */
export const PRESETS: Record<string, z.infer<typeof preferencesSchema>> = {
  'UAE · Backend & AI': {
    titles: ['Senior Backend Engineer', 'Backend Engineer', 'Python Engineer', 'Python Backend Engineer', 'AI Engineer', 'LLM Engineer', 'Software Engineer', 'Full Stack Engineer'],
    locations: ['Dubai', 'Abu Dhabi', 'United Arab Emirates', 'UAE', 'Sharjah'],
    keywords: ['Python', 'Django', 'FastAPI', 'Go', 'PostgreSQL', 'Redis', 'RAG', 'LLM'],
    excludeKeywords: [], languages: ['English'], minSalary: 18500, salaryCurrency: 'AED', salaryPeriod: 'month', remoteOk: true, maxAgeDays: 45,
    searchLocations: ['Dubai', 'Abu Dhabi'], searchCountry: 'ae', sites: ['linkedin', 'indeed', 'bayt', 'gulftalent', 'naukrigulf', 'company', 'other'], maxSearchQueries: 6,
  },
};
