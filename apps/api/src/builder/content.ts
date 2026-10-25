/**
 * Resume builder data shapes. A draft is `content` (what you say) + `design` (how it looks); a template is only a design
 * preset, so switching templates or copying a resume for a job never touches the wording. No Nest imports: the same
 * schemas validate API bodies, LLM output and agent output (see tasks/schemas.ts).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const t = (max: number) => z.string().max(max).default('');
const id = () => z.string().max(40).optional().describe('leave empty; the app assigns ids');

export const linkSchema = z.object({ label: t(120).describe('text shown, e.g. "janedoe"'), url: t(500).describe('full URL, e.g. https://linkedin.com/in/janedoe') });

export const entrySchema = z.object({
  id: id(),
  title: t(300).describe('job title, degree, project or certificate name'),
  subtitle: t(300).describe('employer, school or issuer'),
  start: t(40).describe('as written, e.g. "2019"'),
  end: t(40).describe('as written, e.g. "2023" or "Present"; for certificates the date earned'),
  location: t(120),
  url: t(500),
  description: t(3000).describe('one short paragraph shown under the title (certificates, projects)'),
  bullets: z.array(z.string().max(1000)).max(40).default([]).describe('one achievement per item, without the bullet character'),
});

export const skillGroupSchema = z.object({ id: id(), label: t(120).describe('e.g. "Backend & Languages"'), items: z.array(z.string().max(120)).max(80).default([]) });

export const SECTION_KINDS = ['summary', 'skills', 'experience', 'education', 'projects', 'certificates', 'languages', 'custom'] as const;
export const sectionSchema = z.object({
  id: id(),
  kind: z.enum(SECTION_KINDS),
  title: t(80).describe('heading as written in the CV; empty = no heading (common for the summary)'),
  hidden: z.boolean().default(false),
  text: t(8000).describe('summary / custom section paragraph'),
  groups: z.array(skillGroupSchema).max(30).default([]).describe('skills only: one group per labelled skills line'),
  entries: z.array(entrySchema).max(60).default([]),
});

export const resumeContentSchema = z.object({
  header: z.object({
    fullName: t(120), headline: t(300), email: t(200), phone: t(60), location: t(120),
    links: z.array(linkSchema).max(10).default([]).describe('LinkedIn, GitHub, website… in the order shown'),
  }).default({ fullName: '', headline: '', email: '', phone: '', location: '', links: [] }),
  sections: z.array(sectionSchema).max(30).default([]).describe('in the order they appear'),
});

export const TEMPLATES = ['classic-serif', 'modern-sans', 'compact'] as const;
export const resumeDesignSchema = z.object({
  template: z.enum(TEMPLATES).default('classic-serif'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  fontScale: z.number().min(0.8).max(1.2).default(1),
  marginMm: z.number().min(6).max(30).default(14),
  pageFormat: z.enum(['A4', 'Letter']).default('A4'),
  headingIcons: z.boolean().default(true),
  footer: z.boolean().default(true),
  /** heading icons lifted from the user's imported PDF; plain SVG path data only (rendered as <path d>) */
  icons: z.partialRecord(z.enum(SECTION_KINDS), z.object({
    viewBox: z.string().regex(/^0 0 \d{1,4} \d{1,4}$/),
    d: z.string().max(20000).regex(/^[MLCQZ0-9.\s-]+$/),
  })).optional(),
});

export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type ResumeDesign = z.infer<typeof resumeDesignSchema>;
export type Section = z.infer<typeof sectionSchema>;
export const DEFAULT_DESIGN: ResumeDesign = resumeDesignSchema.parse({});

/** Only web, mail and phone links survive; bare domains ("janedoe.dev") become https links. */
/**
 * A short, plain CV file name an employer can read and no mail filter flags: "Sam-Rivera-Backend-Engineer.pdf".
 * ASCII words joined by hyphens, the role cut at its first qualifier, at most 60 characters.
 */
export function resumeFileName(fullName?: string | null, role?: string | null): string {
  const words = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const name = words(fullName ?? '').slice(0, 3);
  // "AI Engineer - Remote", "ML Engineer, Applied AI", "Engineer (Falcon)", "Frontend / Backend" → the part before
  const r = words((role ?? '').split(/\s[-–—|:]\s|[(,/|:–—]/)[0]).filter((w) => !/^(remote|hybrid|onsite)$/i.test(w)).slice(0, 5);
  const base = [...(name.length ? name : ['Resume']), ...(r.length ? r : ['CV'])].join('-');
  return `${base.slice(0, 60).replace(/-+$/, '')}.pdf`;
}

export function safeUrl(url: string): string {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u)) return `https://${u}`;
  return '';
}

/** Fills ids, trims text and drops empty bullets/items and unsafe links. Run on every save and on imported output. */
export function normalizeContent(input: unknown): ResumeContent {
  const c = resumeContentSchema.parse(input);
  const nid = (x?: string) => x || randomUUID().slice(0, 8);
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    header: { ...c.header, links: c.header.links.map((l) => ({ label: l.label.trim(), url: safeUrl(l.url) })).filter((l) => l.label || l.url) },
    sections: c.sections.map((s) => ({
      ...s, id: nid(s.id),
      groups: s.groups.map((g) => ({ ...g, id: nid(g.id), items: clean(g.items) })),
      entries: s.entries.map((e) => ({ ...e, id: nid(e.id), url: safeUrl(e.url), bullets: clean(e.bullets) })),
    })),
  };
}

interface ProfileLike { fullName?: string | null; headline?: string | null; location?: string | null; summary?: string | null; coreTech?: string[] }
/** Shape of confirmed CV facts (resume_extraction output). */
interface Facts {
  name?: string; headline?: string; skills?: string[]; education?: string[]; certifications?: string[];
  roles?: { company?: string; title?: string; start?: string; end?: string; highlights?: string[] }[];
  projects?: { name?: string; summary?: string }[];
}

/** A first resume from the profile + confirmed CV facts, so nobody starts from a blank page. No AI involved. */
export function fromProfile(p: ProfileLike, factsJson: unknown, email = ''): ResumeContent {
  const f = (factsJson && typeof factsJson === 'object' ? factsJson : {}) as Facts;
  const skills = f.skills?.length ? f.skills : p.coreTech ?? [];
  const section = (kind: Section['kind'], title: string, extra: Partial<z.input<typeof sectionSchema>> = {}) => ({ kind, title, ...extra });
  return normalizeContent({
    header: { fullName: p.fullName || f.name || '', headline: p.headline || f.headline || '', email, location: p.location || '', links: [] },
    sections: [
      section('summary', '', { text: p.summary ?? '' }),
      section('skills', 'Skills', { groups: skills.length ? [{ label: 'Skills', items: skills }] : [] }),
      section('experience', 'Work Experience', { entries: (f.roles ?? []).map((r) => ({ title: r.title ?? '', subtitle: r.company ?? '', start: r.start ?? '', end: r.end ?? '', bullets: r.highlights ?? [] })) }),
      section('education', 'Education', { entries: (f.education ?? []).map((e) => ({ title: e })) }),
      ...(f.projects?.length ? [section('projects', 'Projects', { entries: f.projects.map((x) => ({ title: x.name ?? '', description: x.summary ?? '' })) })] : []),
      section('certificates', 'Certificates', { entries: (f.certifications ?? []).map((c) => ({ title: c })) }),
    ],
  });
}

const visible = (c: ResumeContent) => c.sections.filter((s) => !s.hidden);
const range = (e: { start: string; end: string }) => [e.start, e.end].filter(Boolean).join(' – ');

/** Confirmed-facts shape (resume_extraction) of a draft: a published builder resume needs no AI extraction. */
export function toStructured(c: ResumeContent) {
  const of = (kind: Section['kind']) => visible(c).filter((s) => s.kind === kind).flatMap((s) => s.entries);
  return {
    name: c.header.fullName || undefined,
    headline: c.header.headline || undefined,
    roles: of('experience').map((e) => ({ company: e.subtitle, title: e.title, start: e.start || undefined, end: e.end || undefined, highlights: e.bullets })),
    skills: [...new Set(visible(c).filter((s) => s.kind === 'skills').flatMap((s) => s.groups.flatMap((g) => g.items)))],
    education: of('education').map((e) => [e.title, e.subtitle, range(e)].filter(Boolean).join(', ')),
    projects: of('projects').map((e) => ({ name: e.title, summary: e.description || e.bullets.join(' ') })),
    certifications: of('certificates').map((e) => [e.title, e.subtitle].filter(Boolean).join(' — ')),
  };
}

/** Plain text of a draft (stored as the published CV's extractedText for keyword matching and auto-apply). */
export function toPlainText(c: ResumeContent): string {
  const h = c.header;
  const lines = [h.fullName, h.headline, [h.email, h.phone, ...h.links.map((l) => l.label || l.url), h.location].filter(Boolean).join(' | '), ''];
  for (const s of visible(c)) {
    if (s.title) lines.push(s.title.toUpperCase());
    if (s.text) lines.push(s.text);
    for (const g of s.groups) lines.push(`${g.label}: ${g.items.join(', ')}`);
    for (const e of s.entries) {
      lines.push([e.title, e.subtitle].filter(Boolean).join(', ') + (range(e) || e.location ? ` | ${[range(e), e.location].filter(Boolean).join(' | ')}` : ''));
      if (e.description) lines.push(e.description);
      for (const b of e.bullets) lines.push(`• ${b}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export const tailoringSchema = z.object({
  summary: z.string().max(8000).optional().describe('the summary paragraph reworded for this job; omit to keep it'),
  entries: z.array(z.object({ id: z.string().max(40), bullets: z.array(z.string().max(1000)).max(40) })).max(60).default([])
    .describe('experience/project entries worth changing: their bullets reordered (most relevant first) and reworded with the job\'s vocabulary'),
  skillGroups: z.array(z.object({ id: z.string().max(40), items: z.array(z.string().max(120)).max(80) })).max(30).default([])
    .describe('skill groups with the SAME items, most relevant to the job first'),
  sectionOrder: z.array(z.string().max(40)).max(30).default([]).describe('all section ids in the best order for this job; empty = keep'),
  notes: z.string().max(3000).default('').describe('short list of what you changed and why'),
});

const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

/**
 * Applies AI tailoring to a job copy and enforces "no invention" in code, not only in the prompt: a reworded bullet list
 * with a number that is not already in the resume is rejected, skills can only be reordered (unknown ones are dropped,
 * missing ones kept at the end), and a section order is used only if it is a true permutation.
 */
export function applyTailoring(c: ResumeContent, t: z.infer<typeof tailoringSchema>): { content: ResumeContent; rejected: string[] } {
  const known = new Set(numbers(toPlainText(c)));
  const rejected: string[] = [];
  const invents = (text: string) => numbers(text).some((n) => !known.has(n));
  const entryOut = new Map(t.entries.map((e) => [e.id, e.bullets.map((b) => b.trim()).filter(Boolean)]));
  const groupOut = new Map(t.skillGroups.map((g) => [g.id, g.items]));
  let summaryDone = false;
  let sections = c.sections.map((s) => {
    let next = s;
    if (s.kind === 'summary' && !summaryDone && t.summary?.trim()) {
      summaryDone = true;
      if (invents(t.summary)) rejected.push('summary (added a number that is not in your resume)');
      else next = { ...next, text: t.summary.trim() };
    }
    next = {
      ...next,
      entries: next.entries.map((e) => {
        const bullets = e.id ? entryOut.get(e.id) : undefined;
        if (!bullets?.length) return e;
        if (bullets.some(invents)) { rejected.push(`${e.title || 'entry'} (added a number that is not in your resume)`); return e; }
        return { ...e, bullets };
      }),
      groups: next.groups.map((g) => {
        const order = g.id ? groupOut.get(g.id) : undefined;
        if (!order) return g;
        const byKey = new Map(g.items.map((i) => [i.toLowerCase(), i]));
        const picked = [...new Set(order.map((i) => byKey.get(i.trim().toLowerCase())).filter((i): i is string => !!i))];
        return { ...g, items: [...picked, ...g.items.filter((i) => !picked.includes(i))] };
      }),
    };
    return next;
  });
  const ids = sections.map((s) => s.id);
  if (t.sectionOrder.length === ids.length && new Set(t.sectionOrder).size === ids.length && t.sectionOrder.every((id) => ids.includes(id))) {
    sections = t.sectionOrder.map((id) => sections.find((s) => s.id === id)!);
  }
  return { content: { ...c, sections }, rejected };
}
