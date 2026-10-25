/**
 * Explainable, deterministic job matching (pure). The LLM can add a semantic review on top, but eligibility rules
 * here decide whether a job may be recommended or auto-applied.
 */
import { detectTech } from '../profile/profile';

export interface Preferences {
  titles: string[];
  locations: string[];
  keywords: string[];
  excludeKeywords: string[];
  languages: string[];
  minSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'year' | 'month';
  remoteOk: boolean;
  maxAgeDays: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  titles: [], locations: [], keywords: [], excludeKeywords: [], languages: ['English'], remoteOk: true, maxAgeDays: 45,
};

export interface CandidateFacts {
  coreTech: string[];
  targetRoles: string[];
  yearsExperience?: number | null;
  extraSkills: string[];
}

export interface MatchJob {
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean | null;
  description: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  publishedAt?: Date | null;
}

export interface Dimension {
  score: number;
  weight: number;
  reason: string;
}

export interface MatchResult {
  score: number;
  breakdown: Record<'skills' | 'title' | 'seniority' | 'location' | 'salary' | 'recency', Dimension>;
  blockers: string[];
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
}

const WEIGHTS = { skills: 35, title: 20, seniority: 15, location: 15, salary: 5, recency: 10 } as const;
// seniority words say nothing about the kind of role ("Senior Legal Counsel" is not close to "Senior Backend Engineer")
const STOP = new Set(['and', 'or', 'the', 'of', 'a', 'an', 'to', 'for', 'in', 'with', 'engineer', 'developer', 'ii', 'iii', 'i', 'senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'mid', 'head']);
const LEVELS: [RegExp, number][] = [[/\b(intern|trainee|graduate)\b/i, 0], [/\b(junior|jr\.?|associate|entry)\b/i, 1], [/\b(mid|intermediate)\b/i, 2],
  [/\b(senior|sr\.?)\b/i, 3], [/\b(staff|lead|principal|architect)\b/i, 4], [/\b(head|director|vp|chief)\b/i, 5]];

const norm = (s: string) => s.toLowerCase();
const tokens = (s: string) => new Set(norm(s).replace(/[^a-z0-9+#. ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)));
const has = (hay: string, needle: string) => new RegExp(`(^|[^a-z0-9])${needle.toLowerCase().replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(hay);

/**
 * Technology names that are also ordinary English words ("go to market", "the rest of the team", "spark ideas").
 * They count only with case-sensitive, technical evidence.
 */
const AMBIGUOUS: Record<string, RegExp> = {
  go: /\bGolang\b|\bGo\b(?=\s*(?:[,/)]|and\b|or\b|\(|developer|engineer|services|microservices|programming|language|backend|modules?\b))|(?:Python|Java|Rust|Ruby|Kotlin|TypeScript|Node\.js|C\+\+),?\s+(?:or|and|\/)\s+Go\b/,
  golang: /\bGolang\b/i,
  rest: /\bREST(?:ful)?\b/,
  spark: /\b(?:Apache )?Spark\b(?!\s+(?:joy|ideas|curiosity|conversations?))/,
  rag: /\bRAG\b/,
};
export function techIn(text: string): string[] {
  return detectTech(text).filter((t) => !AMBIGUOUS[t.toLowerCase()] || AMBIGUOUS[t.toLowerCase()].test(text));
}

/**
 * A country in your locations also covers its other names and its cities: "UAE" matches "Ajman" and "Dubai, United
 * Arab Emirates". A city stays a city ("Dubai" does not match "Ajman").
 * ponytail: UAE only (the countries in use); add a row per country when searches go wider.
 */
const COUNTRIES: { names: string[]; places: string[] }[] = [
  { names: ['uae', 'u.a.e', 'united arab emirates', 'emirates'], places: ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'umm al quwain', 'umm al-quwain', 'ras al khaimah', 'ras al-khaimah', 'fujairah', 'al ain'] },
];
const placesFor = (pref: string) => { const c = COUNTRIES.find((x) => x.names.includes(pref.trim().toLowerCase().replace(/\.$/, ''))); return c ? [...c.names, ...c.places] : [pref]; };

/** Remote roles limited to specific countries/regions you are not in are not "remote for you". */
const REMOTE_ANYWHERE = /\b(anywhere|worldwide|global|international|emea|middle east|mena|gcc|gulf|uae|united arab emirates|dubai|abu dhabi)\b/i;
export function remoteFor(location: string | null | undefined, remote: boolean | null | undefined, prefs: Pick<Preferences, 'locations'>): 'match' | 'anywhere' | 'restricted' | 'no' {
  const loc = location ?? '';
  if (prefs.locations.some((l) => placesFor(l).some((p) => has(loc, p)))) return 'match';
  if (!remote && !/\bremote\b/i.test(loc)) return 'no';
  const regions = loc.replace(/\b(remote|fully|hybrid|first|work from home|wfh)\b/gi, '').replace(/[^a-z]+/gi, ' ').trim();
  return !regions || REMOTE_ANYWHERE.test(loc) ? 'anywhere' : 'restricted';
}

export function jobLevel(title: string): number | undefined {
  return LEVELS.find(([re]) => re.test(title))?.[1];
}
export function candidateLevel(years?: number | null): number | undefined {
  if (years == null) return undefined;
  return years < 2 ? 1 : years < 5 ? 2 : years < 9 ? 3 : 4;
}

/** Hard constraints that make a job ineligible regardless of score. */
export function blockersFor(job: MatchJob, prefs: Preferences, facts: CandidateFacts): string[] {
  const text = `${job.title}\n${job.description}`;
  const out: string[] = [];
  for (const k of prefs.excludeKeywords) if (k.trim() && has(text, k.trim())) out.push(`Contains excluded keyword "${k}"`);
  if (/\b(security clearance|active clearance|ts\/sci)\b/i.test(text)) out.push('Requires a security clearance');
  if (/\b(must be a|only|exclusively for)\s+(uae|emirati|us|u\.s\.|saudi|qatari|british)\s+(citizens?|nationals?)\b/i.test(text) || /\b(emirati|uae)\s+nationals?\s+only\b/i.test(text) || /\bcitizenship (is )?required\b/i.test(text)) {
    out.push('Restricted to specific citizens / nationals');
  }
  const lang = text.match(/\b(fluent|fluency|native|proficient)[^.\n]{0,25}\b(arabic|french|german|hindi|urdu|mandarin|spanish)\b[^.\n]{0,40}\b(required|mandatory|must|essential)\b/i)
    ?? text.match(/\b(arabic|french|german|mandarin|spanish)\b[^.\n]{0,15}\b(is )?(required|mandatory|a must)\b/i);
  if (lang) {
    const l = (lang[2] && /^[a-z]+$/i.test(lang[2]) && !/^(is|required)$/i.test(lang[2]) ? lang[2] : lang[1]).toLowerCase();
    if (!prefs.languages.some((x) => norm(x) === l)) out.push(`Requires ${l[0].toUpperCase() + l.slice(1)}`);
  }
  const req = text.match(/\b(\d{1,2})\s*\+?\s*(?:to \d+\s*)?years?(?: of)?(?: professional| relevant| industry)? experience\b/i);
  if (req && facts.yearsExperience != null && Number(req[1]) > facts.yearsExperience + 2) out.push(`Asks for ${req[1]}+ years (you have ${facts.yearsExperience})`);
  if (prefs.locations.length && job.location) {
    const r = remoteFor(job.location, job.remote, prefs);
    if (r === 'no') out.push(`Outside your locations (${job.location})`);
    if (r === 'restricted') out.push(/\bremote\b/i.test(job.location) ? `Remote only within ${job.location.replace(/\bremote\b[,:]?\s*/gi, '').trim() || job.location}` : `Based in ${job.location}`);
  }
  const monthly = toMonthly(job.salaryMax ?? job.salaryMin, job.salaryPeriod);
  const want = prefs.minSalary && prefs.salaryPeriod === 'year' ? prefs.minSalary / 12 : prefs.minSalary;
  if (monthly && want && sameCurrency(job.salaryCurrency, prefs.salaryCurrency) && monthly < want * 0.8) {
    out.push(`Pays below your minimum (${Math.round(monthly)} vs ${want} ${prefs.salaryCurrency ?? ''}/month)`);
  }
  return out;
}

const sameCurrency = (a?: string | null, b?: string) => !!a && !!b && a.toUpperCase() === b.toUpperCase();
function toMonthly(v?: number | null, period?: string | null) {
  if (!v) return undefined;
  return period === 'year' ? v / 12 : period === 'hour' ? v * 160 : period === 'month' ? v : undefined;
}

export function scoreJob(job: MatchJob, prefs: Preferences, facts: CandidateFacts, now = new Date()): MatchResult {
  const jd = `${job.title}\n${job.description}`;
  const candidateSkills = [...new Set([...facts.coreTech, ...facts.extraSkills, ...prefs.keywords].map((s) => s.trim()).filter(Boolean))];
  const jdSkills = [...new Set([...techIn(jd), ...prefs.keywords.filter((k) => (AMBIGUOUS[k.toLowerCase()] ? AMBIGUOUS[k.toLowerCase()].test(jd) : has(jd, k))), ...facts.coreTech.filter((k) => (AMBIGUOUS[k.toLowerCase()] ? AMBIGUOUS[k.toLowerCase()].test(jd) : has(jd, k)))])];
  const matched = jdSkills.filter((s) => candidateSkills.some((c) => norm(c) === norm(s) || (norm(c) === 'go' && norm(s) === 'golang')));
  const missing = jdSkills.filter((s) => !matched.includes(s));

  const skills: Dimension = jdSkills.length
    // at least 3 in the denominator: "Python" alone in a finance role is not a full skills match
    ? { score: Math.min(100, Math.round((matched.length / Math.max(3, jdSkills.length)) * 100 + (matched.length >= 5 ? 10 : 0))), weight: WEIGHTS.skills, reason: `Matches ${matched.length}/${jdSkills.length} technologies${matched.length ? `: ${matched.slice(0, 8).join(', ')}` : ''}` }
    // a description that names no technology at all is a weak signal for a technical candidate; no description is neutral
    : { score: job.description ? 30 : 50, weight: WEIGHTS.skills, reason: job.description ? 'No recognisable technologies listed' : 'No description available yet' };

  const wanted = [...prefs.titles, ...facts.targetRoles];
  let titleScore = wanted.length ? 0 : 50;
  let titleReason = wanted.length ? 'Not one of your target titles' : 'No target titles set';
  for (const w of wanted) {
    if (has(job.title, w)) { titleScore = 100; titleReason = `Matches target title "${w}"`; break; }
    const a = tokens(w), b = tokens(job.title);
    const overlap = [...a].filter((t) => b.has(t)).length / Math.max(1, a.size);
    if (overlap * 85 > titleScore) { titleScore = Math.round(overlap * 85); titleReason = `Close to "${w}"`; }
  }
  // "Senior Java Backend Engineer" is not your backend role if you don't work in Java
  const titleTech = techIn(job.title).filter((t) => !matched.includes(t));
  if (titleTech.length && titleScore > 20) { titleScore = 20; titleReason = `Title asks for ${titleTech.join(', ')}, which you haven't listed`; }

  const jl = jobLevel(job.title), cl = candidateLevel(facts.yearsExperience);
  const seniority: Dimension = jl == null || cl == null
    ? { score: 60, weight: WEIGHTS.seniority, reason: jl == null ? 'Seniority not stated' : 'Your years of experience are not set' }
    : { score: [100, 70, 30][Math.min(2, Math.abs(jl - cl))], weight: WEIGHTS.seniority, reason: jl === cl ? 'Seniority matches your experience' : jl > cl ? 'Role is more senior than your experience' : 'Role is more junior than your experience' };

  const rf = remoteFor(job.location, job.remote, prefs);
  const location: Dimension = !prefs.locations.length ? { score: 60, weight: WEIGHTS.location, reason: 'No preferred locations set' }
    : rf === 'match' ? { score: 100, weight: WEIGHTS.location, reason: `In ${job.location}` }
    : !job.location && !job.remote ? { score: 50, weight: WEIGHTS.location, reason: 'Location not stated' }
    : rf === 'anywhere' ? { score: prefs.remoteOk ? 85 : 20, weight: WEIGHTS.location, reason: prefs.remoteOk ? 'Remote role open to your region' : 'Remote role (you prefer on-site)' }
    : rf === 'restricted' ? { score: 10, weight: WEIGHTS.location, reason: `Remote only within ${job.location}` }
    : { score: 5, weight: WEIGHTS.location, reason: `Outside your locations (${job.location})` };

  const monthly = toMonthly(job.salaryMax ?? job.salaryMin, job.salaryPeriod);
  const want = prefs.minSalary && prefs.salaryPeriod === 'year' ? prefs.minSalary / 12 : prefs.minSalary;
  const salary: Dimension = !monthly || !want ? { score: 60, weight: WEIGHTS.salary, reason: monthly ? 'No minimum salary set' : 'Salary not disclosed' }
    : !sameCurrency(job.salaryCurrency, prefs.salaryCurrency) ? { score: 60, weight: WEIGHTS.salary, reason: `Salary in ${job.salaryCurrency ?? 'unknown currency'} (no conversion)` }
    : monthly >= want ? { score: 100, weight: WEIGHTS.salary, reason: `Pays ~${Math.round(monthly)} ${prefs.salaryCurrency}/month (meets your minimum)` }
    : { score: Math.max(0, Math.round((monthly / want) * 80)), weight: WEIGHTS.salary, reason: `Pays ~${Math.round(monthly)} ${prefs.salaryCurrency}/month (below ${want})` };

  const age = job.publishedAt ? (now.getTime() - job.publishedAt.getTime()) / 864e5 : undefined;
  const recency: Dimension = age == null ? { score: 60, weight: WEIGHTS.recency, reason: 'Publication date unknown' }
    : { score: age <= 7 ? 100 : age <= 30 ? 70 : age <= prefs.maxAgeDays ? 40 : 10, weight: WEIGHTS.recency, reason: `Published ${Math.max(0, Math.round(age))} day(s) ago` };

  const breakdown = { skills, title: { score: titleScore, weight: WEIGHTS.title, reason: titleReason }, seniority, location, salary, recency };
  // a role you are not looking for never reaches the shortlist, however well the rest scores
  const offTarget = wanted.length > 0 && titleScore < 40;
  const score = Math.min(offTarget ? 55 : 100, Math.round(Object.values(breakdown).reduce((s, d) => s + d.score * d.weight, 0) / 100));
  const blockers = blockersFor(job, prefs, facts);
  const strengths = Object.values(breakdown).filter((d) => d.score >= 80).map((d) => d.reason);
  const gaps = Object.values(breakdown).filter((d) => d.score < 50).map((d) => d.reason);
  const explanation = [
    blockers.length ? `Not eligible: ${blockers.join('; ')}.` : score >= 75 ? 'Strong match.' : score >= 60 ? 'Reasonable match.' : 'Weak match.',
    strengths.length ? `Strengths: ${strengths.join('; ')}.` : '',
    gaps.length ? `Gaps: ${gaps.join('; ')}.` : '',
    missing.length ? `Technologies you have not listed: ${missing.slice(0, 8).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return { score, breakdown, blockers, matchedSkills: matched, missingSkills: missing, explanation };
}

export interface ResumeOption {
  id: string;
  label: string;
  version: number;
  isDefault: boolean;
  extractedText?: string | null;
}

/** Pick the existing CV whose content best covers the job's technologies and title. Never generates a new CV. */
export function selectResume(job: MatchJob, resumes: ResumeOption[]): { resumeId?: string; reason: string } {
  if (!resumes.length) return { reason: 'No CV uploaded yet' };
  const jdSkills = techIn(`${job.title}\n${job.description}`);
  const titleTokens = tokens(job.title);
  const ranked = resumes.map((r) => {
    const text = r.extractedText ?? '';
    const covered = jdSkills.filter((s) => has(text, s));
    const titleHits = [...titleTokens].filter((t) => has(text, t)).length;
    return { r, covered, value: covered.length * 3 + titleHits + (r.isDefault ? 0.5 : 0) + r.version * 0.01 };
  }).sort((a, b) => b.value - a.value);
  const best = ranked[0];
  return {
    resumeId: best.r.id,
    reason: best.covered.length ? `"${best.r.label} v${best.r.version}" covers ${best.covered.slice(0, 6).join(', ')}` : `"${best.r.label} v${best.r.version}" (default; no CV mentions the listed technologies)`,
  };
}

/** Below this ATS score a job gets a tailored CV before applying. ponytail: constant; a setting when it needs tuning. */
export const ATS_MIN = 85;

/**
 * ATS-style keyword match of a CV against a job, 0–100: the share of the job's keywords (technologies it names plus the
 * meaningful words of its title) that appear in the CV text. Deterministic, so the score and the missing list explain
 * themselves.
 */
export function atsScore(cvText: string, job: { title: string; description?: string | null }): { score: number; matched: string[]; missing: string[] } {
  const keywords = [...new Set([...techIn(`${job.title}\n${job.description ?? ''}`), ...[...tokens(job.title)].filter((t) => t.length > 2 && !/^\d+$/.test(t))].map((k) => k.toLowerCase()))];
  if (!keywords.length) return { score: 100, matched: [], missing: [] };
  const matched = keywords.filter((k) => has(cvText, k));
  return { score: Math.round((100 * matched.length) / keywords.length), matched, missing: keywords.filter((k) => !matched.includes(k)) };
}
