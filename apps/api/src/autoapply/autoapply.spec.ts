import { dedupeKey } from '../applications/applications';
import { verifyEvidence } from './autoapply.service';
import { buildKit, standingAnswersSchema } from './kit';
import { DEFAULT_PREFERENCES, scoreJob, selectResume, atsScore, ATS_MIN } from './matching';
import { bestApplyOption, buildQueries, parsePostedAt, parseSalary, SEARCH, siteOf, SITES } from './search';
import { ADAPTERS, canonicalUrl, classifyUrl, parseAlertEmail } from './sources';
import { canMove, PRESETS } from './state';

const realFetch = global.fetch;
function mockFetch(routes: Record<string, unknown>) {
  global.fetch = jest.fn(async (url: string | URL | Request) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response('not found', { status: 404 });
    const body = routes[key];
    return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
afterEach(() => { global.fetch = realFetch; });

describe('source adapters normalise to one shape', () => {
  it('Greenhouse (entity-escaped HTML, questions meta)', async () => {
    mockFetch({ '/v1/boards/acme/jobs': { jobs: [{ id: 42, title: 'Senior Backend Engineer', company_name: 'Acme', location: { name: 'Dubai, UAE' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/42', first_published: '2026-10-10T00:00:00Z', content: '&lt;p&gt;We use &lt;b&gt;Python&lt;/b&gt; and Kafka. Contact talent@acme.io&lt;/p&gt;' }] } });
    const [j] = await ADAPTERS.GREENHOUSE!({ board: 'acme' });
    expect(j).toMatchObject({ title: 'Senior Backend Engineer', company: 'Acme', location: 'Dubai, UAE', atsType: 'greenhouse', atsMeta: { board: 'acme', jobId: '42' }, contactEmails: ['talent@acme.io'] });
    expect(j.description).toContain('We use Python and Kafka');
    expect(j.description).not.toContain('<');
  });
  it('Lever, Ashby (salary), SmartRecruiters and Workable', async () => {
    mockFetch({
      '/v0/postings/beta': [{ id: 'l1', text: 'Python Engineer', categories: { location: 'Abu Dhabi', commitment: 'Full-time' }, workplaceType: 'onsite', createdAt: 1_790_000_000_000, descriptionPlain: 'Django APIs', lists: [{ text: 'Requirements', content: '<li>PostgreSQL</li>' }], hostedUrl: 'https://jobs.lever.co/beta/l1', applyUrl: 'https://jobs.lever.co/beta/l1/apply' }],
      '/posting-api/job-board/gamma': { jobs: [{ id: 'a1', title: 'AI Engineer', location: 'Remote', isRemote: true, publishedAt: '2026-10-01', descriptionPlain: 'RAG and LLM evaluation', jobUrl: 'https://jobs.ashbyhq.com/gamma/a1', applyUrl: 'https://jobs.ashbyhq.com/gamma/a1/application', compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'AED', minValue: 240000, maxValue: 300000 }] } }] },
      '/v1/companies/delta/postings/s1': { postingUrl: 'https://jobs.smartrecruiters.com/delta/s1', applyUrl: 'https://jobs.smartrecruiters.com/delta/s1?apply', jobAd: { sections: { jobDescription: { text: '<p>Go services</p>' } } } },
      '/v1/companies/delta/postings': { content: [{ id: 's1', name: 'Software Engineer', company: { name: 'Delta' }, releasedDate: '2026-10-12', location: { city: 'Dubai', country: 'ae' } }] },
      '/widget/accounts/eps': { name: 'Epsilon', jobs: [{ shortcode: 'W1', title: 'Full Stack Engineer', city: 'Dubai', country: 'United Arab Emirates', url: 'https://apply.workable.com/eps/j/W1', application_url: 'https://apply.workable.com/eps/j/W1/apply', description: '<p>TypeScript and React</p>' }] },
    });
    const [lever] = await ADAPTERS.LEVER!({ board: 'beta', company: 'Beta' });
    expect(lever).toMatchObject({ title: 'Python Engineer', company: 'Beta', remote: false, employmentType: 'Full-time', atsType: 'lever', applyUrl: 'https://jobs.lever.co/beta/l1/apply' });
    expect(lever.description).toMatch(/Django APIs[\s\S]*Requirements[\s\S]*PostgreSQL/);
    const [ashby] = await ADAPTERS.ASHBY!({ board: 'gamma' });
    expect(ashby).toMatchObject({ remote: true, salaryMin: 240000, salaryMax: 300000, salaryCurrency: 'AED', salaryPeriod: 'year', atsType: 'ashby' });
    const [sr] = await ADAPTERS.SMARTRECRUITERS!({ board: 'delta' });
    expect(sr).toMatchObject({ company: 'Delta', location: 'Dubai, AE', description: 'Go services', canonicalUrl: 'https://jobs.smartrecruiters.com/delta/s1' });
    const [wk] = await ADAPTERS.WORKABLE!({ board: 'eps' });
    expect(wk).toMatchObject({ company: 'Epsilon', title: 'Full Stack Engineer', atsType: 'workable' });
  });
  it('reports unavailable sources with retryability and rejects unsafe slugs', async () => {
    mockFetch({ '/v1/boards/down/jobs': new Response('err', { status: 503 }) });
    await expect(ADAPTERS.GREENHOUSE!({ board: 'down' })).rejects.toMatchObject({ retryable: true, message: 'HTTP 503' });
    await expect(ADAPTERS.GREENHOUSE!({ board: 'missing' })).rejects.toMatchObject({ retryable: false });
    await expect(ADAPTERS.GREENHOUSE!({ board: '../admin' })).rejects.toThrow(/slug/);
    await expect(ADAPTERS.GREENHOUSE!({ board: 'x', baseUrl: 'http://127.0.0.1:1' })).rejects.toThrow(/disabled/);
  });
});

describe('role search providers', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('classifies sites and picks the best allowed apply link', () => {
    expect(siteOf('https://ae.linkedin.com/jobs/view/123')).toBe('linkedin');
    expect(siteOf('https://ae.indeed.com/viewjob?jk=abc')).toBe('indeed');
    expect(siteOf('https://www.glassdoor.com.br/job/1', 'Glassdoor', 'ByteDance')).toBe('other');
    expect(siteOf('https://www.jobilize.com/job/ae-dubai-backend', 'Acme Careers', 'Acme')).toBe('other'); // reposting site, whatever its label says
    expect(siteOf('https://careers.deliveryhero.com/job/1', '', 'Delivery Hero')).toBe('company');
    expect(siteOf('https://careers.edgegroup.ae/job/1', '', 'EDGE Group PJSC')).toBe('company');
    expect(siteOf('https://acme.wd3.myworkdayjobs.com/x', '', 'Other Name')).toBe('company');
    expect(siteOf('https://evil-linkedin.com/x')).toBe('other'); // strict host match
    const opts = [{ title: 'LinkedIn', link: 'https://www.linkedin.com/jobs/view/9' }, { title: 'Acme Careers', link: 'https://careers.acme.com/1' }, { title: 'Greenhouse', link: 'https://job-boards.greenhouse.io/acme/jobs/7' }];
    expect(bestApplyOption(opts, SITES, 'Acme')).toMatchObject({ atsType: 'greenhouse', site: 'company' });
    expect(bestApplyOption(opts.slice(0, 2), SITES, 'Acme')?.site).toBe('company');
    expect(bestApplyOption(opts, ['linkedin'])?.link).toContain('linkedin.com');
    expect(bestApplyOption(opts, ['bayt'])).toBeNull();
  });
  it('parses posted dates and salaries', () => {
    expect(parsePostedAt('3 days ago', now)?.toISOString()).toBe('2026-10-17T12:00:00.000Z');
    expect(parsePostedAt('30+ days ago', now)?.getTime()).toBe(now.getTime() - 30 * 864e5);
    expect(parsePostedAt('whenever')).toBeUndefined();
    expect(parseSalary('AED 20K–25K a month')).toEqual({ salaryMin: 20000, salaryMax: 25000, salaryCurrency: 'AED', salaryPeriod: 'month' });
    expect(parseSalary('$150,000 a year')).toEqual({ salaryMin: 150000, salaryMax: 150000, salaryCurrency: 'USD', salaryPeriod: 'year' });
  });
  it('builds role × location queries, capped', () => {
    const q = buildQueries({ titles: ['Backend Engineer', 'AI Engineer'], searchLocations: ['Dubai', 'Abu Dhabi'], locations: [], searchCountry: 'ae', maxSearchQueries: 3 }, ['backend engineer ', 'Python Engineer']);
    expect(q).toEqual([{ q: 'Backend Engineer', location: 'Dubai', country: 'ae' }, { q: 'Backend Engineer', location: 'Abu Dhabi', country: 'ae' }, { q: 'AI Engineer', location: 'Dubai', country: 'ae' }]);
  });
  it('Google Jobs (SerpApi) normalises results and applies the site filter', async () => {
    mockFetch({ 'engine=google_jobs': { jobs_results: [
      { job_id: 'g1', title: 'Backend Engineer', company_name: 'Acme', location: 'Dubai - United Arab Emirates', description: 'Python and PostgreSQL', detected_extensions: { posted_at: '2 days ago', schedule_type: 'Full-time', salary: 'AED 20K–25K a month' },
        apply_options: [{ title: 'LinkedIn', link: 'https://ae.linkedin.com/jobs/view/backend-engineer-at-acme-111?trk=x' }, { title: 'Greenhouse', link: 'https://job-boards.greenhouse.io/acme/jobs/5?gh_src=g' }] },
      { job_id: 'g2', title: 'Data Engineer', company_name: 'Beta', location: 'Dubai', description: 'Spark', apply_options: [{ title: 'Bayt', link: 'https://www.bayt.com/en/uae/jobs/data-engineer-1/' }] },
    ] } });
    const hits = await SEARCH.GOOGLE_JOBS({ apiKey: 'k' }, { q: 'Backend Engineer', location: 'Dubai', country: 'ae' }, ['linkedin', 'company']);
    expect(hits).toHaveLength(1); // Bayt-only job filtered out
    expect(hits[0]).toMatchObject({ title: 'Backend Engineer', company: 'Acme', atsType: 'greenhouse', atsMeta: { board: 'acme', jobId: '5' }, salaryMin: 20000, salaryCurrency: 'AED', employmentType: 'Full-time', viaLabel: 'Google Jobs · Company careers page' });
    expect(hits[0].canonicalUrl).toBe('https://job-boards.greenhouse.io/acme/jobs/5');
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('gl=ae');
  });
  it('surfaces a rejected key as non-retryable', async () => {
    mockFetch({ 'engine=google_jobs': new Response('{}', { status: 401 }) });
    await expect(SEARCH.GOOGLE_JOBS({ apiKey: 'bad' }, { q: 'x', location: '', country: 'ae' }, SITES)).rejects.toMatchObject({ retryable: false });
  });
  it('Jooble', async () => {
    mockFetch({ 'jooble.org/api/': { jobs: [{ id: 7, title: 'Python Engineer', company: 'Gamma', location: 'Dubai', snippet: '<b>Python</b> &amp; Django', source: 'gulftalent.com', link: 'https://jooble.org/desc/7', updated: '2026-10-18T00:00:00' }] } });
    const [j] = await SEARCH.JOOBLE({ apiKey: 'k' }, { q: 'Python Engineer', location: 'Dubai', country: 'ae' }, SITES);
    expect(j).toMatchObject({ title: 'Python Engineer', company: 'Gamma', site: 'gulftalent', description: 'Python & Django', atsType: 'other' });
  });
});

describe('URLs, alerts and dedupe', () => {
  it('Indeed links: classified, canonical and parsed from alert emails', () => {
    expect(classifyUrl('https://ae.indeed.com/viewjob?jk=abc123').atsType).toBe('indeed');
    expect(canonicalUrl('https://ae.indeed.com/rc/clk?jk=abc123&from=alert&tk=1')).toBe('https://ae.indeed.com/viewjob?jk=abc123');
    const { jobs } = parseAlertEmail('Backend Engineer\nAcme\nDubai\nhttps://ae.indeed.com/rc/clk?jk=abc123&from=ja\n');
    expect(jobs[0]).toMatchObject({ title: 'Backend Engineer', company: 'Acme', atsType: 'indeed', canonicalUrl: 'https://ae.indeed.com/viewjob?jk=abc123' });
  });
  it('matches hosts by exact domain, not substring', () => {
    expect(classifyUrl('https://evil-linkedin.com/jobs/view/1').atsType).toBe('other');
    expect(classifyUrl('https://linkedin.com.evil.io/jobs/view/1').atsType).toBe('other');
    expect(classifyUrl('https://notworkable.com/x').atsType).toBe('other');
    expect(classifyUrl('https://evilgreenhouse.io/acme/jobs/1').atsType).toBe('other');
    expect(classifyUrl('https://ae.linkedin.com/jobs/view/1').atsType).toBe('linkedin');
    expect(canonicalUrl('https://evil-linkedin.com/jobs/view/4012345678/?x=1')).toBe('https://evil-linkedin.com/jobs/view/4012345678/?x=1');
  });
  it('classifies job URLs and strips tracking', () => {
    expect(classifyUrl('https://job-boards.greenhouse.io/acme/jobs/42?gh_src=x')).toEqual({ atsType: 'greenhouse', atsMeta: { board: 'acme', jobId: '42' } });
    expect(classifyUrl('https://jobs.lever.co/beta/abc-123')).toEqual({ atsType: 'lever', atsMeta: { board: 'beta', jobId: 'abc-123' } });
    expect(classifyUrl('https://www.bayt.com/en/uae/jobs/x-123/').atsType).toBe('bayt');
    expect(canonicalUrl('https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc&refId=x')).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    expect(canonicalUrl('https://acme.com/careers/1?utm_source=a&id=7#apply')).toBe('https://acme.com/careers/1?id=7');
  });
  it('parses LinkedIn (HTML) and Bayt (text) alert emails without fetching', () => {
    const html = `From: LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>
      <table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/4011111111/?trackingId=1">Senior Backend Engineer</a><p>Careem</p><p>Dubai, United Arab Emirates</p></td></tr>
      <tr><td><a href="https://www.linkedin.com/comm/jobs/view/4022222222/?trackingId=2">AI Engineer</a><p>G42</p><p>Abu Dhabi</p></td></tr>
      <tr><td><a href="https://www.linkedin.com/comm/jobs/view/4011111111/?trackingId=3">Senior Backend Engineer</a></td></tr>
      <a href="https://www.linkedin.com/jobs/search/?unsubscribe=1">Unsubscribe</a></table>`;
    const r = parseAlertEmail(html);
    expect(r.jobs.map((j) => [j.title, j.company, j.location, j.atsType])).toEqual([
      ['Senior Backend Engineer', 'Careem', 'Dubai, United Arab Emirates', 'linkedin'], ['AI Engineer', 'G42', 'Abu Dhabi', 'linkedin'],
    ]);
    expect(r.sender?.email).toBe('jobalerts-noreply@linkedin.com');
    const text = 'New jobs for you\n\nPython Developer\nAcme FZ-LLC\nDubai\nhttps://www.bayt.com/en/uae/jobs/python-developer-4999999/\n';
    expect(parseAlertEmail(text).jobs[0]).toMatchObject({ title: 'Python Developer', company: 'Acme FZ-LLC', location: 'Dubai', atsType: 'bayt' });
  });
  it('dedupes across sources with the tracker key', () => {
    expect(dedupeKey('Acme FZ-LLC', 'Senior Backend Engineer')).toBe(dedupeKey('ACME', 'senior backend engineer'));
  });
});

const facts = { coreTech: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Redis', 'Go'], targetRoles: ['Senior Backend Engineer'], yearsExperience: 7, extraSkills: ['Kafka'] };
const prefs = { ...PRESETS['UAE · Backend & AI'] };
const job = (over: Partial<Parameters<typeof scoreJob>[0]> = {}) => ({
  title: 'Senior Backend Engineer', company: 'Acme', location: 'Dubai, UAE', remote: false, publishedAt: new Date('2026-10-15'),
  description: 'Build Python and Django services on PostgreSQL, Redis and Kafka. 5+ years experience.', ...over,
});

describe('matching', () => {
  const now = new Date('2026-10-18');
  it('scores a strong match with an explained breakdown', () => {
    const m = scoreJob(job(), prefs, facts, now);
    expect(m.score).toBeGreaterThanOrEqual(80);
    expect(m.blockers).toEqual([]);
    expect(m.breakdown.title.reason).toMatch(/Senior Backend Engineer/);
    expect(m.breakdown.skills.reason).toMatch(/Python/);
    expect(m.explanation).toMatch(/Strong match/);
  });
  it('off-target titles never reach the shortlist; one listed technology is not a full skills match (real Ziina case)', () => {
    const analyst = scoreJob(job({ title: 'Finance Data Analyst', description: 'Reporting in Python and Excel for the finance team.' }), prefs, facts, now);
    expect(analyst.score).toBeLessThan(60);
    expect(analyst.breakdown.skills.score).toBe(33);
    for (const title of ['Senior Corporate Legal Counsel', 'Senior Product Designer (Design Systems)']) expect(scoreJob(job({ title }), prefs, facts, now).score).toBeLessThan(60); // real Binance / Careem titles
    expect(scoreJob(job(), prefs, facts, now).score).toBeGreaterThanOrEqual(80);
  });
  it('a title in a language you do not use is not your role (real Google Jobs case)', () => {
    const java = scoreJob(job({ title: 'Senior Java Backend Engineer | Redis & Postgres', description: 'Strong Java expertise, Redis caching and PostgreSQL.' }), prefs, facts, now);
    expect(java.breakdown.title.reason).toMatch(/Title asks for Java/);
    expect(java.missingSkills).toContain('Java');
    expect(java.score).toBeLessThan(75); // never auto-applied
    expect(scoreJob(job({ title: 'Senior .NET Backend Engineer', description: 'C# and .NET Core' }), prefs, facts, now).score).toBeLessThan(75);
    expect(scoreJob(job({ title: 'Senior.NET Backend Engineer | Microservices' }), prefs, facts, now).breakdown.title.reason).toMatch(/\.NET/); // real title
    expect(scoreJob(job({ description: 'Python, Django, PostgreSQL. Apply at careers.acme.net' }), prefs, facts, now).missingSkills).not.toContain('.NET');
    expect(scoreJob(job({ title: 'Senior Backend Engineer (JavaScript)' }), prefs, facts, now).breakdown.title.reason).toMatch(/JavaScript/);
  });
  it('ATS score: share of the job\'s technologies and title words found in the CV, with the missing ones listed', () => {
    const cv = 'Senior Backend Engineer. Python, Django, FastAPI, PostgreSQL, Redis, Docker, Kubernetes, AWS.';
    const full = atsScore(cv, { title: 'Senior Backend Engineer', description: 'Python, Django and PostgreSQL on AWS.' });
    expect(full.score).toBe(100);
    const gap = atsScore(cv, { title: 'Backend Engineer, Payments', description: 'Go, Kafka and PostgreSQL. Python is a plus.' });
    expect(gap.missing).toEqual(expect.arrayContaining(['go', 'kafka', 'payments']));
    expect(gap.score).toBeLessThan(ATS_MIN);
    expect(atsScore(cv, { title: 'Engineer' }).score).toBe(100); // nothing to match against
  });
  it('applies hard eligibility rules before recommending', () => {
    expect(scoreJob(job({ location: 'London, UK' }), prefs, facts, now).blockers.join()).toMatch(/Outside your locations/);
    // a country covers its emirates and other names; a city stays a city (real case: "Ajman" with "UAE" in locations)
    const uae = { ...prefs, locations: ['UAE'] };
    for (const location of ['Ajman', 'Ras Al Khaimah', 'Dubai, United Arab Emirates', 'Sharjah - U.A.E.']) expect(scoreJob(job({ location }), uae, facts, now).blockers).toEqual([]);
    expect(scoreJob(job({ location: 'Ajman' }), { ...prefs, locations: ['Dubai'] }, facts, now).blockers.join()).toMatch(/Outside your locations \(Ajman\)/);
    expect(scoreJob(job({ location: 'Riyadh, Saudi Arabia' }), uae, facts, now).blockers.join()).toMatch(/Outside your locations/);
    expect(scoreJob(job({ description: 'UAE nationals only. Python.' }), prefs, facts, now).blockers.join()).toMatch(/citizens|nationals/);
    expect(scoreJob(job({ description: 'Fluent Arabic is required. Python.' }), prefs, facts, now).blockers.join()).toMatch(/Arabic/);
    expect(scoreJob(job({ description: 'Requires 12+ years of experience with Python' }), prefs, facts, now).blockers.join()).toMatch(/12\+ years/);
    expect(scoreJob(job({ salaryMax: 9000, salaryCurrency: 'AED', salaryPeriod: 'month' }), prefs, facts, now).blockers.join()).toMatch(/below your minimum/);
    expect(scoreJob(job({ description: 'Python. Security clearance required.' }), prefs, facts, now).blockers.join()).toMatch(/clearance/);
    expect(scoreJob(job(), { ...prefs, excludeKeywords: ['Kafka'] }, facts, now).blockers.join()).toMatch(/excluded keyword/);
    expect(scoreJob(job({ remote: true, location: 'Remote' }), prefs, facts, now).blockers).toEqual([]);
  });
  it('remote roles restricted to other countries are not eligible; region-wide remote is', () => {
    expect(scoreJob(job({ remote: true, location: 'Remote, United States' }), prefs, facts, now).blockers.join()).toMatch(/Remote only within United States/);
    expect(scoreJob(job({ remote: true, location: 'San Francisco' }), prefs, facts, now).blockers.join()).toMatch(/Based in San Francisco/);
    expect(scoreJob(job({ remote: true, location: 'Remote, EMEA' }), prefs, facts, now).blockers).toEqual([]);
    expect(scoreJob(job({ remote: true, location: 'Remote' }), prefs, facts, now).blockers).toEqual([]);
    expect(scoreJob(job({ remote: true, location: 'Dubai or Remote' }), prefs, facts, now).breakdown.location.score).toBe(100);
  });
  it('does not mistake English words for technologies', () => {
    const sales = scoreJob(job({ title: 'Regional Sales Director', description: 'Lead our go to market plan with the rest of the team and spark ideas.' }), prefs, facts, now);
    expect(sales.matchedSkills).toEqual([]);
    expect(sales.score).toBeLessThan(50);
    expect(scoreJob(job({ description: 'Services in Go and Python, RESTful APIs, Apache Spark.' }), prefs, facts, now).matchedSkills).toEqual(expect.arrayContaining(['Go', 'Python']));
  });
  it('weights a weak / unrelated role low and handles missing data neutrally', () => {
    expect(scoreJob(job({ title: 'Marketing Manager', description: 'Brand campaigns' }), prefs, facts, now).score).toBeLessThan(55);
    expect(scoreJob(job({ description: '' }), DEFAULT_PREFERENCES, { ...facts, yearsExperience: null }, now).breakdown.skills.reason).toMatch(/No description/);
  });
  it('selects the existing CV that covers the job, never inventing one', () => {
    const resumes = [
      { id: 'fe', label: 'Frontend CV', version: 1, isDefault: true, extractedText: 'React, TypeScript, Next.js' },
      { id: 'be', label: 'Backend CV', version: 2, isDefault: false, extractedText: 'Python, Django, PostgreSQL, Kafka, Redis' },
    ];
    expect(selectResume(job(), resumes)).toMatchObject({ resumeId: 'be' });
    expect(selectResume(job(), [])).toEqual({ reason: 'No CV uploaded yet' });
  });
});

describe('apply kit', () => {
  const base = {
    title: 'Senior Backend Engineer', company: 'Acme', sourceLabel: 'Acme (Greenhouse)', account: { name: 'Sam Rivera', email: 'sam@example.test' },
    profile: { fullName: 'Sam Rivera', location: 'Dubai', yearsExperience: 7, noticePeriodDays: 30 }, matchedSkills: ['Python'], resumeLabel: 'Backend CV v2', allowAiFreeText: true,
  };
  const questions = [
    { key: 'first_name', label: 'First Name', required: true, type: 'input_text' },
    { key: 'email', label: 'Email', required: true, type: 'input_text' },
    { key: 'resume', label: 'Resume/CV', required: true, type: 'input_file' },
    { key: 'q_sal', label: 'What are your salary expectations?', required: true, type: 'input_text' },
    { key: 'q_auth', label: 'Are you legally authorized to work in the UAE?', required: true, type: 'multi_value_single_select', options: ['Yes', 'No'] },
    { key: 'q_why', label: 'Why do you want to work at Acme?', required: false, type: 'textarea' },
    { key: 'gender', label: 'Gender', required: false, type: 'multi_value_single_select', options: ['Male', 'Female', 'Decline To Self Identify'], sensitive: true },
    { key: 'privacy', label: 'I consent to the privacy policy', required: true, type: 'multi_value_single_select', options: ['Yes'] },
  ];
  it('never invents unknown answers and blocks completion on them', () => {
    const k = buildKit({ ...base, questions, standing: standingAnswersSchema.parse({}) });
    const by = Object.fromEntries(k.answers.map((a) => [a.key, a]));
    expect(by.first_name).toMatchObject({ answer: 'Sam', source: 'profile' });
    expect(by.email.answer).toBe('sam@example.test');
    expect(by.q_sal).toMatchObject({ answer: '', needsReview: true });
    expect(by.q_auth).toMatchObject({ answer: '', needsReview: true });
    expect(by.gender).toMatchObject({ answer: '', sensitive: true });
    expect(by.privacy).toMatchObject({ answer: '', sensitive: true, needsReview: true });
    expect(k.aiDraftKeys).toEqual(['q_why']);
    expect(k.complete).toBe(false);
    expect(k.missingRequired).toEqual(expect.arrayContaining(['What are your salary expectations?', 'I consent to the privacy policy']));
  });
  it('uses only explicit standing decisions for sensitive and factual questions', () => {
    const standing = standingAnswersSchema.parse({ salaryExpectation: 'AED 20,000 per month', workAuthorization: 'Yes', demographics: 'decline', consentToPrivacyNotices: true });
    const k = buildKit({ ...base, questions, standing, aiAnswers: { q_why: 'Your platform work matches my backend focus.' } });
    const by = Object.fromEntries(k.answers.map((a) => [a.key, a]));
    expect(by.q_sal).toMatchObject({ answer: 'AED 20,000 per month', source: 'standing' });
    expect(by.q_auth).toMatchObject({ answer: 'Yes', source: 'standing' });
    expect(by.gender).toMatchObject({ answer: 'Decline To Self Identify', source: 'standing' });
    expect(by.privacy).toMatchObject({ answer: 'Yes', source: 'standing' });
    expect(by.q_why).toMatchObject({ source: 'ai' });
    expect(k.complete).toBe(true);
  });
  it('answers facts from the CV and saved answers (real Binance / Bybit questions)', () => {
    const cv = 'Senior Backend Engineer\nAcme Fintech 2023 – Present | Dubai, UAE\nWill be on call; p99 200 ms.\nScrum Master duties.\nEDUCATION\nB.Tech Computer science and Engineering';
    const q = (key: string, label: string, options?: string[]) => ({ key, label, required: true, type: options ? 'multi_value_single_select' : 'input_text', options });
    const real = [
      q('live', 'Where do you currently live?', ['Afghanistan', 'Saudi Arabia', 'United Arab Emirates', 'United Kingdom']),
      q('edu', 'What is your highest level of education?', ['High school', "Bachelor's or equivalent", "Master's", 'PhD']),
      { ...q('lang', 'What language(s) can you speak at a native or business level?', ['Arabic', 'English', 'Hindi']), type: 'multi_value_multi_select' },
      q('emp', 'What is your current employment status?', ['Employed full-time', 'Self-employed', 'Unemployed', 'Student']),
      q('before', 'Have you ever been employed at Binance before?', ['Yes', 'No']),
      q('hear', 'How did you hear about our job opening? Please select one of the following options:', ['LinkedIn', 'Company Website', 'Referral', 'Other']),
    ];
    const k = buildKit({ ...base, company: 'Binance', sourceLabel: 'Binance', resumeText: cv, questions: real, standing: standingAnswersSchema.parse({ currentLocation: 'Dubai, UAE', languages: 'English, Malayalam' }) });
    const by = Object.fromEntries(k.answers.map((a) => [a.key, a.answer]));
    expect(by).toEqual({ live: 'United Arab Emirates', edu: "Bachelor's or equivalent", lang: 'English', emp: 'Employed full-time', before: 'No', hear: 'Company Website' });
    expect(k.complete).toBe(true);
    // never claims what the CV doesn't say
    expect(buildKit({ ...base, company: 'Acme Fintech', resumeText: cv, questions: [real[4]], standing: standingAnswersSchema.parse({}) }).answers[0].answer).toBe(''); // Acme is in the CV
    expect(buildKit({ ...base, resumeText: 'Will be on call; 200 ms. Scrum Master.', questions: [real[1]], standing: standingAnswersSchema.parse({}) }).answers[0].answer).toBe('');
  });
  it('rejects answers that are not valid options', () => {
    const k = buildKit({ ...base, questions: [questions[4]], standing: standingAnswersSchema.parse({ workAuthorization: 'Pending visa transfer' }) });
    expect(k.answers[0]).toMatchObject({ answer: '', needsReview: true });
    expect(k.answers[0].note).toMatch(/not one of the options/);
  });
});

describe('state and evidence', () => {
  it('enforces lead transitions', () => {
    expect(canMove('READY_FOR_REVIEW', 'APPROVED')).toBe(true);
    expect(canMove('APPROVED', 'APPLYING')).toBe(true);
    expect(canMove('SUBMITTED', 'APPROVED')).toBe(false);
    expect(canMove('DISCOVERED', 'SUBMITTED')).toBe(false);
    expect(canMove('REJECTED', 'APPROVED')).toBe(false);
  });
  it('requires a real confirmation before counting a submission', () => {
    expect(verifyEvidence({ confirmationText: 'Thank you for applying! Your application has been received.' }).ok).toBe(true);
    expect(verifyEvidence({ confirmationUrl: 'https://job-boards.greenhouse.io/acme/jobs/42/confirmation' }).ok).toBe(true);
    expect(verifyEvidence({ confirmationText: 'Please fix the errors below' }).ok).toBe(false);
    expect(verifyEvidence(undefined).ok).toBe(false);
    expect(verifyEvidence({ note: 'Applied on LinkedIn' }, true).ok).toBe(true);
  });
});
