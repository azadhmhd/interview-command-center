/**
 * Job source adapters behind one interface. Each returns jobs in the common NormalizedJob shape so matching,
 * dedupe and the apply flow never depend on a particular source.
 *
 * Only official / public endpoints are used (verified against live boards 2026-10-18):
 *   Greenhouse  boards-api.greenhouse.io/v1/boards/{board}/jobs        (public Job Board API)
 *   Lever       api.lever.co/v0/postings/{company}                      (public Postings API)
 *   Ashby       api.ashbyhq.com/posting-api/job-board/{board}           (public Posting API)
 *   SmartRecr.  api.smartrecruiters.com/v1/companies/{company}/postings (public Posting API)
 *   Workable    apply.workable.com/api/v1/widget/accounts/{account}     (public widget API)
 * LinkedIn / Bayt / GulfTalent / Naukrigulf are NOT crawled (robots.txt / terms). They enter via pasted job-alert
 * emails or pasted job URLs instead.
 */
import { JobSourceType } from '@prisma/client';
import { fetchPage, htmlToText, parseJobPage } from '../applications/job-import';

export interface NormalizedJob {
  externalId?: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'year' | 'month' | 'hour';
  publishedAt?: Date;
  description: string;
  canonicalUrl: string;
  applyUrl?: string;
  atsType: string;
  atsMeta?: Record<string, string>;
  /** recruiter emails seen in the posting */
  contactEmails?: string[];
}

export interface SourceConfig {
  /** board / company / account slug used by the ATS */
  board: string;
  /** display name override for the company */
  company?: string;
  /** test-only override of the API host (AUTOAPPLY_ALLOW_CUSTOM_BASE_URL=true) */
  baseUrl?: string;
}

export class SourceError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

const UA = 'InterviewCommandCenter/0.1 (self-hosted job discovery; public job board APIs)';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (html?: string | null) => (html ? htmlToText(html).slice(0, 30000) : '');
const date = (v: unknown) => {
  const d = typeof v === 'number' ? new Date(v) : typeof v === 'string' ? new Date(v) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};
const emails = (s: string) => [...new Set((s.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()).filter((e) => !/noreply|no-reply|donotreply|example\./.test(e)))];
const period = (s?: string): NormalizedJob['salaryPeriod'] =>
  !s ? undefined : /year|annual|1 year/i.test(s) ? 'year' : /month/i.test(s) ? 'month' : /hour/i.test(s) ? 'hour' : undefined;

function base(cfg: SourceConfig, official: string) {
  if (cfg.baseUrl) {
    if (process.env.AUTOAPPLY_ALLOW_CUSTOM_BASE_URL !== 'true') throw new SourceError('Custom API hosts are disabled', false);
    return cfg.baseUrl.replace(/\/$/, '');
  }
  return official;
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new SourceError(`Network error: ${(e as Error).message}`, true);
  }
  if (res.status === 404) throw new SourceError('Board not found (404): check the board / company slug', false);
  if (res.status === 429) throw new SourceError('Rate limited (429)', true);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status >= 500);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError('Response was not valid JSON', true);
  }
}

const slug = (s: string) => {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(s)) throw new SourceError('Board slug may only contain letters, digits, dot, dash or underscore', false);
  return encodeURIComponent(s);
};

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ADAPTERS: Partial<Record<JobSourceType, (cfg: SourceConfig) => Promise<NormalizedJob[]>>> = {
  async GREENHOUSE(cfg) {
    const b = slug(cfg.board);
    const j = await getJson<{ jobs: Obj[] }>(`${base(cfg, 'https://boards-api.greenhouse.io')}/v1/boards/${b}/jobs?content=true`);
    return (j.jobs ?? []).map((x) => {
      const description = text(decodeEntities(x.content ?? ''));
      return {
        externalId: String(x.id), title: x.title, company: cfg.company ?? x.company_name ?? cfg.board, location: x.location?.name,
        remote: /remote/i.test(x.location?.name ?? '') || undefined, publishedAt: date(x.first_published ?? x.updated_at),
        description, canonicalUrl: x.absolute_url, applyUrl: x.absolute_url, atsType: 'greenhouse',
        atsMeta: { board: cfg.board, jobId: String(x.id), ...(cfg.baseUrl && { apiBase: cfg.baseUrl }) }, contactEmails: emails(description),
      };
    });
  },

  async LEVER(cfg) {
    const b = slug(cfg.board);
    const j = await getJson<Obj[]>(`${base(cfg, 'https://api.lever.co')}/v0/postings/${b}?mode=json`);
    return (j ?? []).map((x) => {
      const lists = (x.lists ?? []).map((l: Obj) => `${l.text}\n${text(l.content)}`).join('\n\n');
      const description = [x.descriptionPlain ?? text(x.description), lists, x.additionalPlain ?? ''].filter(Boolean).join('\n\n').slice(0, 30000);
      const sal = x.salaryRange as Obj | undefined;
      return {
        externalId: x.id, title: x.text, company: cfg.company ?? cfg.board, location: x.categories?.location ?? x.country,
        remote: x.workplaceType ? x.workplaceType === 'remote' : undefined, employmentType: x.categories?.commitment,
        salaryMin: sal?.min, salaryMax: sal?.max, salaryCurrency: sal?.currency, salaryPeriod: period(sal?.interval),
        publishedAt: date(x.createdAt), description, canonicalUrl: x.hostedUrl, applyUrl: x.applyUrl ?? x.hostedUrl, atsType: 'lever',
        atsMeta: { board: cfg.board, jobId: x.id }, contactEmails: emails(description),
      };
    });
  },

  async ASHBY(cfg) {
    const b = slug(cfg.board);
    const j = await getJson<{ jobs: Obj[] }>(`${base(cfg, 'https://api.ashbyhq.com')}/posting-api/job-board/${b}?includeCompensation=true`);
    return (j.jobs ?? []).filter((x) => x.isListed !== false).map((x) => {
      const comp = (x.compensation?.summaryComponents ?? []).find((c: Obj) => c.compensationType === 'Salary');
      const description = x.descriptionPlain ?? text(x.descriptionHtml);
      return {
        externalId: x.id, title: x.title, company: cfg.company ?? cfg.board, location: x.location, remote: x.isRemote ?? undefined,
        employmentType: x.employmentType, salaryMin: comp?.minValue ?? undefined, salaryMax: comp?.maxValue ?? undefined,
        salaryCurrency: comp?.currencyCode ?? undefined, salaryPeriod: period(comp?.interval), publishedAt: date(x.publishedAt),
        description, canonicalUrl: x.jobUrl, applyUrl: x.applyUrl ?? x.jobUrl, atsType: 'ashby', atsMeta: { board: cfg.board, jobId: x.id },
        contactEmails: emails(description),
      };
    });
  },

  async SMARTRECRUITERS(cfg) {
    const b = slug(cfg.board);
    const host = base(cfg, 'https://api.smartrecruiters.com');
    const list = await getJson<{ content: Obj[] }>(`${host}/v1/companies/${b}/postings?limit=100`);
    const out: NormalizedJob[] = [];
    // ponytail: details (description, apply URL) need one call per posting; capped at 40 most recent, sequential.
    for (const x of (list.content ?? []).slice(0, 40)) {
      let d: Obj = {};
      try { d = await getJson<Obj>(`${host}/v1/companies/${b}/postings/${encodeURIComponent(x.id)}`); } catch { /* keep list data */ }
      const sec = d.jobAd?.sections ?? {};
      const description = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation'].map((k) => text(sec[k]?.text)).filter(Boolean).join('\n\n');
      const loc = x.location ?? {};
      out.push({
        externalId: x.id, title: x.name, company: cfg.company ?? x.company?.name ?? cfg.board,
        location: [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(', ') || undefined, remote: loc.remote ?? undefined,
        employmentType: x.typeOfEmployment?.label, publishedAt: date(x.releasedDate), description,
        canonicalUrl: d.postingUrl ?? `https://jobs.smartrecruiters.com/${b}/${x.id}`, applyUrl: d.applyUrl ?? d.postingUrl,
        atsType: 'smartrecruiters', atsMeta: { board: cfg.board, jobId: x.id }, contactEmails: emails(description),
      });
    }
    return out;
  },

  async WORKABLE(cfg) {
    const b = slug(cfg.board);
    const j = await getJson<{ name?: string; jobs: Obj[] }>(`${base(cfg, 'https://apply.workable.com')}/api/v1/widget/accounts/${b}?details=true`);
    return (j.jobs ?? []).map((x) => {
      const description = text(x.description);
      return {
        externalId: x.shortcode, title: x.title, company: cfg.company ?? j.name ?? cfg.board,
        location: [x.city, x.state, x.country].filter(Boolean).join(', ') || undefined, remote: x.telecommuting ?? undefined,
        employmentType: x.employment_type, publishedAt: date(x.published_on ?? x.created_at), description,
        canonicalUrl: x.url ?? x.shortlink, applyUrl: x.application_url ?? x.url, atsType: 'workable',
        atsMeta: { board: cfg.board, jobId: x.shortcode }, contactEmails: emails(description),
      };
    });
  },
};

/** Exact domain or a real subdomain of it ("evil-linkedin.com" and "linkedin.com.evil.io" do not count). */
export const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Recognise the job board / ATS of a URL and the ids needed to fetch its application questions. */
export function classifyUrl(raw: string): { atsType: string; atsMeta?: Record<string, string> } {
  let u: URL;
  try { u = new URL(raw); } catch { return { atsType: 'other' }; }
  const h = u.hostname.replace(/^www\./, '');
  const p = u.pathname.split('/').filter(Boolean);
  if (onDomain(h, 'greenhouse.io')) {
    const i = p.indexOf('jobs');
    return { atsType: 'greenhouse', atsMeta: i > 0 ? { board: p[i - 1], jobId: p[i + 1] } : undefined };
  }
  if (h === 'jobs.lever.co' && p.length >= 2) return { atsType: 'lever', atsMeta: { board: p[0], jobId: p[1] } };
  if (h === 'jobs.ashbyhq.com' && p.length >= 2) return { atsType: 'ashby', atsMeta: { board: p[0], jobId: p[1] } };
  if (onDomain(h, 'smartrecruiters.com')) return { atsType: 'smartrecruiters' };
  if (onDomain(h, 'workable.com')) return { atsType: 'workable' };
  for (const [d, t] of [['linkedin.com', 'linkedin'], ['indeed.com', 'indeed'], ['bayt.com', 'bayt'], ['gulftalent.com', 'gulftalent'], ['naukrigulf.com', 'naukrigulf']] as const) {
    if (onDomain(h, d)) return { atsType: t };
  }
  return { atsType: 'other' };
}

/** Canonical form of a job URL: no tracking parameters, no fragment. LinkedIn /comm/ links collapse to /jobs/view/{id}. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  const li = onDomain(u.hostname, 'linkedin.com') && u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/);
  if (li) return `https://www.linkedin.com/jobs/view/${li[1]}/`;
  const jk = onDomain(u.hostname, 'indeed.com') && u.searchParams.get('jk');
  if (jk) return `https://${u.hostname}/viewjob?jk=${encodeURIComponent(jk)}`;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|trk|ref|refId|trackingId|src|source|gh_src|lever-source|ashby_)/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** Import one job from a URL the user pasted (any site). Uses the existing SSRF-safe page fetcher. */
export async function importFromUrl(raw: string): Promise<NormalizedJob> {
  const { html, url } = await fetchPage(raw);
  const job = parseJobPage(html, url);
  if (!job.jobTitle) throw new SourceError('No job posting found on that page. Some sites block automated access: paste the details instead.', false);
  const { atsType, atsMeta } = classifyUrl(url);
  const description = job.jobDescription ? text(job.jobDescription) : '';
  return {
    title: job.jobTitle, company: job.companyName ?? new URL(url).hostname, location: job.location, description,
    canonicalUrl: canonicalUrl(url), applyUrl: url, atsType, atsMeta, contactEmails: emails(description),
  };
}

const ALERT_LINKS: { re: RegExp; atsType: string }[] = [
  { re: /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/[^\s"'<>)]+/gi, atsType: 'linkedin' },
  { re: /https?:\/\/(?:[\w-]+\.)?indeed\.com\/(?:viewjob|rc\/clk|pagead\/clk)\?[^\s"'<>)]*\bjk=[^\s"'<>)]+/gi, atsType: 'indeed' },
  { re: /https?:\/\/(?:www\.)?bayt\.com\/[^\s"'<>)]*\/jobs\/[^\s"'<>)]+/gi, atsType: 'bayt' },
  { re: /https?:\/\/(?:www\.)?gulftalent\.com\/[^\s"'<>)]*jobs?\/[^\s"'<>)]+/gi, atsType: 'gulftalent' },
  { re: /https?:\/\/(?:www\.)?naukrigulf\.com\/[^\s"'<>)]*-jid-[^\s"'<>)]+/gi, atsType: 'naukrigulf' },
  { re: /https?:\/\/(?:job-)?boards\.greenhouse\.io\/[^\s"'<>)]+\/jobs\/\d+[^\s"'<>)]*/gi, atsType: 'greenhouse' },
  { re: /https?:\/\/jobs\.lever\.co\/[^\s"'<>)]+/gi, atsType: 'lever' },
  { re: /https?:\/\/jobs\.ashbyhq\.com\/[^\s"'<>)]+/gi, atsType: 'ashby' },
];

/**
 * Pure: pull jobs out of a pasted job-alert email (LinkedIn, Bayt, GulfTalent, Naukrigulf, ATS links).
 * Alert emails list "Title / Company / Location" near each link; we take the closest non-link lines.
 * Descriptions are not fetched automatically (those boards block or forbid crawling); open the lead or use
 * "Fetch details" for a single explicit import.
 */
export function parseAlertEmail(content: string): { jobs: NormalizedJob[]; sender?: { name?: string; email?: string } } {
  const isHtml = /<a\s[^>]*href=/i.test(content);
  const out = new Map<string, NormalizedJob>();
  const from = content.match(/^From:\s*(?:"?([^"<\n]+?)"?\s*)?<?([\w.%+-]+@[\w.-]+\.[a-z]{2,})>?/im);
  if (isHtml) {
    for (const m of content.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = decodeEntities(m[1]);
      const kind = ALERT_LINKS.find((l) => new RegExp(l.re.source, 'i').test(href));
      if (!kind) continue;
      const anchor = htmlToText(m[2]).replace(/\s+/g, ' ').trim();
      const after = htmlToText(content.slice(m.index! + m[0].length, m.index! + m[0].length + 600)).split('\n').map((s) => s.trim()).filter(Boolean);
      add(out, href, kind.atsType, anchor || after[0], anchor ? after[0] : after[1], anchor ? after[1] : after[2]);
    }
  } else {
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    lines.forEach((line, i) => {
      for (const kind of ALERT_LINKS) {
        for (const m of line.matchAll(new RegExp(kind.re.source, 'gi'))) {
          const prev = lines.slice(Math.max(0, i - 4), i).filter((l) => l && !/^https?:/.test(l) && !/^(view job|apply|see more)/i.test(l));
          const [title, company, location] = prev.length >= 3 ? prev.slice(-3) : [prev[0], prev[1], prev[2]];
          add(out, m[0], kind.atsType, title, company, location);
        }
      }
    });
  }
  return { jobs: [...out.values()], sender: from ? { name: from[1]?.trim(), email: from[2].toLowerCase() } : undefined };

  function add(map: Map<string, NormalizedJob>, href: string, atsType: string, title?: string, company?: string, location?: string) {
    let canonical: string;
    try { canonical = canonicalUrl(href.replace(/[.,;]+$/, '')); } catch { return; }
    if (map.has(canonical) || !title || /unsubscribe|view all|see all jobs/i.test(title)) return;
    const meta = classifyUrl(canonical);
    map.set(canonical, {
      title: title.slice(0, 200), company: (company ?? 'Unknown company').replace(/^at\s+/i, '').slice(0, 200), location: location?.slice(0, 200),
      description: '', canonicalUrl: canonical, applyUrl: canonical, atsType: meta.atsType === 'other' ? atsType : meta.atsType, atsMeta: meta.atsMeta,
    });
  }
}

export interface AtsQuestion {
  key: string;
  label: string;
  required: boolean;
  type: string;
  options?: string[];
  /** compliance / demographic / consent questions */
  sensitive?: boolean;
}

/** Application questions where the ATS publishes them (Greenhouse). Others fall back to the standard field set. */
export async function fetchQuestions(atsType: string, meta?: Record<string, string> | null): Promise<AtsQuestion[] | null> {
  if (atsType !== 'greenhouse' || !meta?.board || !meta?.jobId) return null;
  const host = base({ board: meta.board, baseUrl: meta.apiBase }, 'https://boards-api.greenhouse.io');
  const j = await getJson<Obj>(`${host}/v1/boards/${slug(meta.board)}/jobs/${encodeURIComponent(meta.jobId)}?questions=true`);
  const qs: AtsQuestion[] = [];
  for (const q of j.questions ?? []) {
    const f = (q.fields ?? [])[0] ?? {};
    qs.push({ key: f.name, label: q.label, required: !!q.required, type: f.type, options: (f.values ?? []).map((v: Obj) => v.label).filter(Boolean) });
  }
  for (const group of [j.compliance ?? [], j.demographic_questions?.questions ?? [], j.location_questions ?? []]) {
    for (const q of group) {
      const f = (q.fields ?? q.questions?.[0]?.fields ?? [])[0] ?? {};
      qs.push({ key: f.name ?? `compliance_${q.id ?? qs.length}`, label: q.label ?? q.description ?? 'Compliance question', required: !!q.required, type: f.type ?? 'select', options: (f.values ?? q.answer_options ?? []).map((v: Obj) => v.label).filter(Boolean), sensitive: true });
    }
  }
  return qs;
}
