/** Resume builder types (mirror of apps/api/src/builder/content.ts) and the design templates. */

export interface ResumeLink { label: string; url: string }
export interface ResumeEntry { id?: string; title: string; subtitle: string; start: string; end: string; location: string; url: string; description: string; bullets: string[] }
export interface SkillGroup { id?: string; label: string; items: string[] }
export const SECTION_KINDS = ['summary', 'skills', 'experience', 'education', 'projects', 'certificates', 'languages', 'custom'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
export interface ResumeSection { id?: string; kind: SectionKind; title: string; hidden: boolean; text: string; groups: SkillGroup[]; entries: ResumeEntry[] }
export interface ResumeContent {
  header: { fullName: string; headline: string; email: string; phone: string; location: string; links: ResumeLink[] };
  sections: ResumeSection[];
}
export type TemplateKey = 'classic-serif' | 'modern-sans' | 'compact';
export interface ResumeDesign { template: TemplateKey; accent: string; fontScale: number; marginMm: number; pageFormat: 'A4' | 'Letter'; headingIcons: boolean; footer: boolean; icons?: Partial<Record<SectionKind, { viewBox: string; d: string }>> }

export interface DraftSummary {
  id: string; title: string; applicationId?: string | null; jobLeadId?: string | null; sourceDraftId?: string | null;
  publishedResumeId?: string | null; publishedAt?: string | null; createdAt: string; updatedAt: string;
  application?: { id: string; companyName: string; jobTitle: string } | null;
  jobLead?: { id: string; company: string; title: string } | null;
}
export interface Draft extends DraftSummary { content: ResumeContent; design: ResumeDesign; publishedResume?: { id: string; label: string; version: number } | null }

export const KIND_LABEL: Record<SectionKind, string> = {
  summary: 'Summary', skills: 'Skills', experience: 'Work Experience', education: 'Education', projects: 'Projects',
  certificates: 'Certificates', languages: 'Languages', custom: 'Custom section',
};

export const emptyEntry = (): ResumeEntry => ({ title: '', subtitle: '', start: '', end: '', location: '', url: '', description: '', bullets: [] });
export const newSection = (kind: SectionKind): ResumeSection => ({
  id: Math.random().toString(36).slice(2, 10), kind, title: kind === 'summary' ? '' : KIND_LABEL[kind], hidden: false, text: '',
  groups: kind === 'skills' ? [{ id: Math.random().toString(36).slice(2, 10), label: '', items: [] }] : [], entries: [],
});

/** Page size in CSS px (96 dpi), as the renderer uses it. */
export const PAGE = { A4: { w: 793.7007874, h: 1122.519685, css: '210mm 297mm' }, Letter: { w: 816, h: 1056, css: '8.5in 11in' } } as const;
export const mmToPx = (mm: number) => mm * 3.779527559055118;

/**
 * A template is a typography preset; the renderer derives every size and gap from it (formulas in resume-pages.tsx).
 * classic-serif is the configuration that reproduces the reference CV: Source Serif Pro 11.5pt, line height 1.2,
 * spacing step 1, simple icon headings.
 */
export interface Tokens {
  font: string; basePt: number; namePt: number; jobTitlePt: number; headingPt: number; titlePt: number;
  /** line height (1.1–1.5) and "space between elements" step (0–4) */
  lineHeight: number; spacing: 0 | 1 | 2 | 3 | 4;
  headingStyle: 'simple' | 'line';
  /** per-font vertical bullet nudge (em) */
  bulletNudgeEm: number;
}
const SERIF = '"Source Serif Pro", "Noto Sans", sans-serif';
const SANS = '"Source Sans 3", "Noto Sans", sans-serif';
export const TEMPLATES: Record<TemplateKey, { label: string; description: string; tokens: Tokens }> = {
  'classic-serif': {
    label: 'Classic Serif', description: 'Your CV design: serif, left header, icon headings',
    tokens: { font: SERIF, basePt: 11.5, namePt: 22.5, jobTitlePt: 15, headingPt: 14, titlePt: 11.75, lineHeight: 1.2, spacing: 1, headingStyle: 'simple', bulletNudgeEm: -0.02 },
  },
  'modern-sans': {
    label: 'Modern Sans', description: 'Sans-serif with ruled headings',
    tokens: { font: SANS, basePt: 11, namePt: 24, jobTitlePt: 14, headingPt: 13, titlePt: 11.25, lineHeight: 1.25, spacing: 2, headingStyle: 'line', bulletNudgeEm: 0.02 },
  },
  compact: {
    label: 'Compact', description: 'Serif, smaller type: fits more on one page',
    tokens: { font: SERIF, basePt: 10.5, namePt: 20, jobTitlePt: 13, headingPt: 12.5, titlePt: 10.75, lineHeight: 1.15, spacing: 0, headingStyle: 'simple', bulletNudgeEm: -0.02 },
  },
};

/** Heading icon lifted from your own PDF on import (kept in your data, not in this repository). */
export interface ResumeIcon { viewBox: string; d: string }

export const DEFAULT_DESIGN: ResumeDesign = { template: 'classic-serif', accent: '#000000', fontScale: 1, marginMm: 14, pageFormat: 'A4', headingIcons: true, footer: true };
