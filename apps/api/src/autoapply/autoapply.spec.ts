import { dedupeKey } from '../applications/applications';
import { verifyEvidence } from './autoapply.service';
import { buildKit, standingAnswersSchema } from './kit';
import { DEFAULT_PREFERENCES, scoreJob, selectResume } from './matching';
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

describe('URLs, alerts and dedupe', () => {
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
  it('applies hard eligibility rules before recommending', () => {
    expect(scoreJob(job({ location: 'London, UK' }), prefs, facts, now).blockers.join()).toMatch(/Outside your locations/);
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
