/**
 * Role + location search providers. They aggregate LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf and company career
 * pages through official APIs, so nothing here crawls those sites directly (their terms forbid it):
 *   Google Jobs  via SerpApi   GET  serpapi.com/search.json?engine=google_jobs   (free plan: 250 searches / month)
 *   Jooble                     POST jooble.org/api/{key}  { keywords, location, page }
 */
import { canonicalUrl, classifyUrl, NormalizedJob, onDomain, SourceError } from './sources';
import { htmlToText } from '../applications/job-import';

export const SITES = ['linkedin', 'indeed', 'bayt', 'gulftalent', 'naukrigulf', 'company', 'other'] as const;
export type Site = (typeof SITES)[number];
export const SITE_LABEL: Record<Site, string> = { linkedin: 'LinkedIn', indeed: 'Indeed', bayt: 'Bayt', gulftalent: 'GulfTalent', naukrigulf: 'Naukrigulf', company: 'Company careers page', other: 'Other job sites' };

/** Job boards / aggregators that are not the employer's own careers page. */
const OTHER_BOARDS = ['glassdoor.com', 'jooble.org', 'naukri.com', 'monster.com', 'monstergulf.com', 'foundit.in', 'careerjet.ae', 'careerjet.com', 'dubizzle.com', 'laimoon.com', 'drjobpro.com', 'ziprecruiter.com', 'talent.com', 'jobleads.com', 'simplyhired.com', 'jora.com', 'adzuna.com', 'wellfound.com', 'builtin.com', 'jobrapido.com', 'whatjobs.com', 'jobsora.com', 'tanqeeb.com', 'akhtaboot.com', 'recruit.net', 'expatriates.com', 'gulfjobs.com', 'bebee.com', 'learn4good.com', 'trabajo.org'];

/** Which site a link belongs to (for the site filter). ATS-hosted and employer domains count as the company page. */
export function siteOf(url: string, label = ''): Site {
  let h = '';
  try { h = new URL(url).hostname.replace(/^www\./, ''); } catch { /* label only */ }
  const by = (d: string, name: RegExp) => (h && onDomain(h, d)) || name.test(label);
  if (by('linkedin.com', /\blinkedin\b/i)) return 'linkedin';
  if (by('indeed.com', /\bindeed\b/i)) return 'indeed';
  if (by('bayt.com', /\bbayt\b/i)) return 'bayt';
  if (by('gulftalent.com', /\bgulf ?talent\b/i)) return 'gulftalent';
  if (by('naukrigulf.com', /\bnaukri ?gulf\b/i)) return 'naukrigulf';
  if (h && OTHER_BOARDS.some((d) => onDomain(h, d))) return 'other';
  if (!h) return /careers?|company|website/i.test(label) ? 'company' : 'other';
  return 'company';
}

export interface ApplyOption { title: string; link: string; site: Site; atsType: string }

/** Best place to apply among the allowed sites: auto-appliable ATS form > company page > big boards > others. */
export function bestApplyOption(options: { title: string; link: string }[], allowed: readonly string[]): ApplyOption | null {
  const rank = (o: ApplyOption) => (['greenhouse', 'lever', 'ashby'].includes(o.atsType) ? 4 : o.site === 'company' ? 3 : o.site === 'other' ? 1 : 2);
  const enriched = options.filter((o) => /^https?:\/\//.test(o.link)).map((o) => ({ ...o, site: siteOf(o.link, o.title), atsType: classifyUrl(o.link).atsType }));
  const usable = enriched.filter((o) => allowed.includes(o.site));
  return usable.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

/** "3 days ago", "21 hours ago", "1 month ago", "30+ days ago" → date. */
export function parsePostedAt(s: string | undefined, now = new Date()): Date | undefined {
  const m = s?.match(/(\d+)\+?\s*(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return /just posted|today/i.test(s ?? '') ? now : undefined;
  const ms = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[m[2].toLowerCase() as 'day'];
  return new Date(now.getTime() - Number(m[1]) * ms);
}

/** "AED 20K–25K a month", "20,000 - 25,000 AED per month", "$150K a year" → structured salary. */
export function parseSalary(s: string | undefined): Pick<NormalizedJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'> {
  if (!s) return {};
  const cur = s.match(/\b(AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR|INR)\b/i)?.[1]?.toUpperCase() ?? (s.includes('$') ? 'USD' : s.includes('£') ? 'GBP' : s.includes('€') ? 'EUR' : undefined);
  const nums = [...s.matchAll(/(\d[\d,.]*)\s*([kK])?/g)].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)).filter((n) => n >= 100);
  const period = /\b(month|monthly|mo)\b/i.test(s) ? 'month' : /\b(year|annual|yr)\b/i.test(s) ? 'year' : /\bhour\b/i.test(s) ? 'hour' : undefined;
  if (!nums.length) return {};
  return { salaryMin: Math.min(...nums), salaryMax: Math.max(...nums), salaryCurrency: cur, salaryPeriod: period };
}

export interface SearchQuery { q: string; location: string; country: string }
export interface SearchConfig { apiKey: string; baseUrl?: string }
export interface SearchHit extends NormalizedJob { site: Site; viaLabel: string; applyOptions: { title: string; link: string }[] }

const UA = 'InterviewCommandCenter/0.1 (self-hosted job search)';
function host(cfg: SearchConfig, official: string) {
  if (!cfg.baseUrl) return official;
  if (process.env.AUTOAPPLY_ALLOW_CUSTOM_BASE_URL !== 'true') throw new SourceError('Custom API hosts are disabled', false);
  return cfg.baseUrl.replace(/\/$/, '');
}
async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new SourceError(`Network error: ${(e as Error).message}`, true);
  }
  if (res.status === 401 || res.status === 403) throw new SourceError('The provider rejected the API key', false);
  if (res.status === 429) throw new SourceError('Provider rate limit or monthly quota reached', true);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status >= 500);
  try { return (await res.json()) as T; } catch { throw new SourceError('Response was not valid JSON', true); }
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SEARCH = {
  async GOOGLE_JOBS(cfg: SearchConfig, query: SearchQuery, allowed: readonly string[]): Promise<SearchHit[]> {
    const p = new URLSearchParams({ engine: 'google_jobs', q: `${query.q} ${query.location}`.trim(), gl: query.country, hl: 'en', api_key: cfg.apiKey });
    const j = await call<Obj>(`${host(cfg, 'https://serpapi.com')}/search.json?${p}`);
    if (j.error && !/hasn't returned any results/i.test(j.error)) throw new SourceError(`SerpApi: ${String(j.error).slice(0, 200)}`, /limit|quota/i.test(j.error));
    const out: SearchHit[] = [];
    for (const x of (j.jobs_results ?? []) as Obj[]) {
      const options: { title: string; link: string }[] = (x.apply_options ?? []).map((o: Obj) => ({ title: String(o.title ?? ''), link: String(o.link ?? '') }));
      if (!options.length && x.share_link) options.push({ title: x.via ?? 'Google', link: x.share_link });
      const best = bestApplyOption(options, allowed);
      if (!best) continue; // none of the places to apply are on your allowed sites
      const ext = x.detected_extensions ?? {};
      const { atsMeta } = classifyUrl(best.link);
      out.push({
        externalId: x.job_id, title: x.title, company: x.company_name, location: x.location, description: String(x.description ?? '').slice(0, 30000),
        remote: ext.work_from_home === true || /\bremote\b/i.test(x.location ?? '') || undefined, employmentType: ext.schedule_type,
        publishedAt: parsePostedAt(ext.posted_at), ...parseSalary(ext.salary), canonicalUrl: canonicalUrl(best.link), applyUrl: best.link,
        atsType: best.atsType, atsMeta, site: best.site, viaLabel: `Google Jobs · ${SITE_LABEL[best.site]}`, applyOptions: options,
      });
    }
    return out;
  },

  // ponytail: request/response shape follows Jooble's published client examples; their docs are behind the key form.
  async JOOBLE(cfg: SearchConfig, query: SearchQuery, allowed: readonly string[]): Promise<SearchHit[]> {
    const j = await call<Obj>(`${host(cfg, 'https://jooble.org')}/api/${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keywords: query.q, location: query.location, page: '1' }),
    });
    const out: SearchHit[] = [];
    for (const x of (j.jobs ?? []) as Obj[]) {
      if (!x.link || !x.title) continue;
      const site = siteOf(x.source ? `https://${String(x.source).replace(/^https?:\/\//, '')}` : '', x.source ?? '');
      if (!allowed.includes(site)) continue;
      out.push({
        externalId: String(x.id ?? ''), title: x.title, company: x.company || 'Unknown company', location: x.location, description: htmlToText(String(x.snippet ?? '')).slice(0, 5000),
        employmentType: x.type, publishedAt: x.updated ? new Date(x.updated) : undefined, ...parseSalary(x.salary), canonicalUrl: canonicalUrl(x.link), applyUrl: x.link,
        atsType: classifyUrl(x.link).atsType, site, viaLabel: `Jooble · ${SITE_LABEL[site]}`, applyOptions: [{ title: x.source ?? 'Jooble', link: x.link }],
      });
    }
    return out;
  },
};

/** Role × location queries from your preferences, capped to protect the monthly search budget. */
export function buildQueries(prefs: { titles: string[]; searchLocations: string[]; locations: string[]; searchCountry: string; maxSearchQueries: number }, targetRoles: string[]): SearchQuery[] {
  const roles = [...new Set([...prefs.titles, ...targetRoles].map((t) => t.trim()).filter(Boolean))];
  const locs = prefs.searchLocations.length ? prefs.searchLocations : prefs.locations.slice(0, 1);
  const out: SearchQuery[] = [];
  for (const q of roles) for (const location of locs.length ? locs : ['']) out.push({ q, location, country: prefs.searchCountry });
  return out.slice(0, prefs.maxSearchQueries);
}
