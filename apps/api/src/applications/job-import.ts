import { checkBaseUrl } from '../llm/url-guard';

/** Fields the application form can be pre-filled with. Everything is optional: pages vary wildly. */
export interface JobImport {
  jobUrl: string; companyName?: string; companyWebsite?: string; jobTitle?: string; location?: string;
  seniority?: string; source?: string; jobDescription?: string; benefits?: string;
}

type Obj = Record<string, unknown>;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', hellip: '…' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

/** HTML fragment → readable plain text with list bullets and paragraph breaks. */
export function htmlToText(html: string) {
  // Descriptions are often entity-encoded HTML, so decode once to expose the tags.
  return decode(decode(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>|<\/(div|ul|ol|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? htmlToText(v) : undefined);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

function findPosting(node: unknown): Obj | undefined {
  if (Array.isArray(node)) return node.map(findPosting).find(Boolean);
  if (!node || typeof node !== 'object') return;
  const o = node as Obj;
  const t = o['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return o;
  return findPosting(o['@graph']);
}

function location(p: Obj) {
  if (p.jobLocationType === 'TELECOMMUTE') return 'Remote';
  const locs = (Array.isArray(p.jobLocation) ? p.jobLocation : [p.jobLocation]).filter(Boolean) as Obj[];
  const parts = locs.map((l) => {
    const a = (l.address ?? {}) as Obj;
    const country = typeof a.addressCountry === 'object' ? (a.addressCountry as Obj)?.name : a.addressCountry;
    return [a.addressLocality, a.addressRegion, country].map(str).filter((x, i, xs) => x && xs.indexOf(x) === i).join(', ');
  }).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(' / ') : undefined;
}

const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'))?.[1];

const SOURCES: [RegExp, string][] = [[/linkedin\./, 'LinkedIn'], [/indeed\./, 'Indeed'], [/bayt\./, 'Bayt'], [/glassdoor\./, 'Glassdoor'], [/naukrigulf\./, 'Naukrigulf'], [/greenhouse\.io/, 'Greenhouse'], [/lever\.co/, 'Lever'], [/myworkdayjobs\./, 'Workday'], [/wellfound\./, 'Wellfound']];
const SENIORITY = /\b(intern|junior|mid|senior|staff|principal|lead|head|director)\b/i;

/** Pure: extract a job posting from a page. schema.org JobPosting JSON-LD first, then OpenGraph/meta tags. */
export function parseJobPage(html: string, url: string): JobImport {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const out: JobImport = { jobUrl: url, source: SOURCES.find(([re]) => re.test(host))?.[1] ?? host };
  let posting: Obj | undefined;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { posting = findPosting(JSON.parse(m[1].trim())); } catch { /* malformed block: try the next one */ }
    if (posting) break;
  }
  if (posting) {
    const org = first(posting.hiringOrganization) as Obj | undefined;
    const site = str(first(org?.sameAs)) ?? str(org?.url);
    Object.assign(out, {
      jobTitle: str(posting.title), companyName: str(org?.name), companyWebsite: site?.startsWith('http') ? site : undefined,
      location: location(posting), jobDescription: str(posting.description),
      benefits: str(Array.isArray(posting.jobBenefits) ? posting.jobBenefits.join('\n') : posting.jobBenefits),
    });
  } else {
    // ponytail: heuristic fallback (title "… at Company", <main> text); an LLM pass over the text would be sharper.
    const title = str(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    out.jobTitle = str(meta(html, 'og:title')) ?? title?.split(/ [|–-] /)[0];
    out.companyName = title?.match(/ at ([^|–]+?)(?: [|–-] |$)/)?.[1] ?? str(meta(html, 'og:site_name'));
    const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? '';
    const body = htmlToText(main.replace(/<(nav|header|footer|form|svg|button|noscript)[\s\S]*?<\/\1>/gi, ''));
    const teaser = str(meta(html, 'og:description') ?? meta(html, 'description'));
    out.jobDescription = body.length > (teaser?.length ?? 0) * 2 ? body.slice(0, 20000) : teaser;
  }
  out.seniority = out.jobTitle?.match(SENIORITY)?.[1].replace(/^./, (c) => c.toUpperCase());
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as unknown as JobImport;
}

const MAX_BYTES = 3_000_000;

/** Fetch a public page. Every redirect hop is re-checked so a public URL cannot bounce to an internal one. */
export async function fetchPage(raw: string): Promise<{ html: string; url: string }> {
  let url = raw;
  for (let hop = 0; hop < 5; hop++) {
    await checkBaseUrl(url, false);
    const res = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' },
    });
    const next = res.status >= 300 && res.status < 400 && res.headers.get('location');
    if (next) { url = new URL(next, url).toString(); continue; }
    if (!res.ok) throw new Error(`The site answered HTTP ${res.status}${[401, 403, 999].includes(res.status) ? ' (it blocks automated access)' : ''}`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('Page is too large');
    const html = (await res.text()).slice(0, MAX_BYTES);
    return { html, url };
  }
  throw new Error('Too many redirects');
}
