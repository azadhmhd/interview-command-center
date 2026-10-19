import type { Tone } from '@/components/ui';

export type LeadStatus = 'DISCOVERED' | 'EVALUATED' | 'SHORTLISTED' | 'READY_FOR_REVIEW' | 'APPROVED' | 'APPLYING' | 'SUBMITTED' | 'INTERVIEW' | 'REJECTED' | 'WITHDRAWN' | 'NEEDS_ATTENTION' | 'SKIPPED';

export const STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  DISCOVERED: { label: 'Discovered', tone: 'neutral' },
  EVALUATED: { label: 'Evaluated', tone: 'neutral' },
  SHORTLISTED: { label: 'Shortlisted', tone: 'info' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'accent' },
  APPROVED: { label: 'Approved', tone: 'info' },
  APPLYING: { label: 'Applying…', tone: 'info' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  INTERVIEW: { label: 'Interview', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'warning' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
};

export interface LeadRow {
  id: string; title: string; company: string; location?: string | null; remote?: boolean | null; status: LeadStatus; statusReason?: string | null;
  fitScore?: number | null; blockers: string[]; atsType: string; sourceType: string; discoveredVia: string[]; publishedAt?: string | null; discoveredAt: string;
  kitStatus: string; autoApproved: boolean; salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string | null; salaryPeriod?: string | null;
  canonicalUrl: string; trackerApplicationId?: string | null;
}

export interface KitAnswer { key: string; label: string; required: boolean; type: string; answer: string; source: string; needsReview: boolean; sensitive: boolean; options?: string[]; note?: string }

export const salary = (l: Pick<LeadRow, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'>) =>
  l.salaryMin || l.salaryMax ? `${l.salaryCurrency ?? ''} ${[l.salaryMin, l.salaryMax].filter(Boolean).map((v) => v!.toLocaleString()).join('–')}${l.salaryPeriod ? ` / ${l.salaryPeriod}` : ''}`.trim() : null;

export const scoreTone = (s?: number | null): Tone => (s == null ? 'neutral' : s >= 75 ? 'success' : s >= 60 ? 'info' : s >= 45 ? 'warning' : 'neutral');
export const ATS_LABEL: Record<string, string> = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters', workable: 'Workable', linkedin: 'LinkedIn', indeed: 'Indeed', bayt: 'Bayt', gulftalent: 'GulfTalent', naukrigulf: 'Naukrigulf', other: 'Web' };
