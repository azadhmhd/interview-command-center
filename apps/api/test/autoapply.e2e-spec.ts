import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'node:http';
import { config } from '../src/config';
import { ResumeJobs } from '../src/builder/jobs';
import { PrismaService } from '../src/prisma.service';
import { TickService } from '../src/scheduler/tick.service';
import { boot, Client, register } from './helpers';

/** Fake public job-board APIs (Greenhouse + Lever shapes). No real site is contacted; nothing is ever submitted. */
async function fakeBoards() {
  const jobs = [
    { id: 1, title: 'Senior Backend Engineer', company_name: 'Acme', location: { name: 'Dubai, UAE' }, absolute_url: 'https://boards.example/acme/jobs/1', first_published: new Date().toISOString(), content: '&lt;p&gt;Python, Django, PostgreSQL, Redis and Kafka. Questions: talent@acme.io&lt;/p&gt;' },
    { id: 2, title: 'Marketing Manager', company_name: 'Acme', location: { name: 'Dubai, UAE' }, absolute_url: 'https://boards.example/acme/jobs/2', first_published: new Date().toISOString(), content: 'Brand campaigns and events.' },
    { id: 3, title: 'Backend Engineer', company_name: 'Acme', location: { name: 'London, UK' }, absolute_url: 'https://boards.example/acme/jobs/3', first_published: new Date().toISOString(), content: 'Python and PostgreSQL.' },
    { id: 4, title: 'Python Backend Engineer', company_name: 'Acme', location: { name: 'Dubai, UAE' }, absolute_url: 'https://boards.example/acme/jobs/4', first_published: new Date().toISOString(), content: 'FastAPI, Python, PostgreSQL, Redis.' },
  ];
  const questions = { questions: [
    { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
    { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text' }] },
    { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text' }] },
    { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file' }] },
    { label: 'What are your salary expectations?', required: true, fields: [{ name: 'question_1', type: 'input_text' }] },
  ] };
  let lever = [{ id: 'dup', text: 'Senior Backend Engineer', categories: { location: 'Dubai' }, descriptionPlain: 'Python', hostedUrl: 'https://jobs.example/beta/dup', applyUrl: 'https://jobs.example/beta/dup/apply' }];
  const searches: string[] = [];
  const serp = { jobs_results: [
    { job_id: 's1', title: 'Platform Backend Engineer', company_name: 'Zeta', location: 'Dubai - United Arab Emirates', description: 'Python, Django, PostgreSQL and Redis.', detected_extensions: { posted_at: '1 day ago' },
      apply_options: [{ title: 'LinkedIn', link: 'https://www.linkedin.com/jobs/view/555' }, { title: 'Zeta Careers', link: 'https://careers.zeta.example/jobs/1' }] },
    { job_id: 's2', title: 'Backend Engineer (Bayt only)', company_name: 'Eta', location: 'Dubai', description: 'Python', apply_options: [{ title: 'Bayt', link: 'https://www.bayt.com/en/uae/jobs/x-1/' }] },
  ] };
  const server: Server = createServer((req, res) => {
    const send = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const url = req.url ?? '';
    if (url.startsWith('/v1/boards/down/')) return send(503, { error: 'down' });
    if (/^\/v1\/boards\/acme\/jobs\/\d+\?questions=true/.test(url)) return send(200, questions);
    if (url.startsWith('/v1/boards/acme/jobs')) return send(200, { jobs });
    if (url.startsWith('/v0/postings/beta')) return send(200, lever);
    if (url.startsWith('/search.json')) { searches.push(url); return void setTimeout(() => send(200, serp), url.includes('slow') ? 5000 : 0); }
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, searches, setLever: (l: typeof lever) => { lever = l; }, close: () => new Promise<void>((r) => server.close(() => r())) };
}

describe('Auto Apply (separate section)', () => {
  let app: INestApplication;
  let atsGate: () => Promise<number>;
  let prisma: PrismaService;
  let u: Client;
  let other: Client;
  let boards: Awaited<ReturnType<typeof fakeBoards>>;
  const leadBy = async (title: string) => (await u.get('/autoapply/leads')).body.find((l: { title: string }) => l.title === title);

  beforeAll(async () => {
    app = await boot();
    prisma = app.get(PrismaService);
    // what the worker tick does before a job can be claimed: the ATS check (and tailoring when the CV scores low)
    atsGate = () => app.get(ResumeJobs).atsTick();
    boards = await fakeBoards();
    u = await register(app, 'Applicant');
    other = await register(app, 'Other');
    await u.put('/profile', { fullName: 'Sam Rivera', coreTech: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Redis', 'Kafka'], targetRoles: ['Senior Backend Engineer'], yearsExperience: 7 }).expect(200);
    await u.raw().post('/api/resumes').set(u.auth).field('label', 'Backend CV').attach('file', Buffer.from('Sam Rivera\nPython, Django, FastAPI, PostgreSQL, Redis, Kafka'), { filename: 'cv.txt', contentType: 'text/plain' }).expect(201);
    const presets = (await u.get('/autoapply/presets')).body;
    await u.put('/autoapply/config', { preferences: presets['UAE · Backend & AI'], standingAnswers: { salaryExpectation: 'AED 20,000 per month' } }).expect(200);
  });
  afterAll(async () => { await boards.close(); await app.close(); });

  it('discovers, normalises, scores and explains jobs from a company board', async () => {
    const src = await u.post('/autoapply/sources', { type: 'GREENHOUSE', name: 'Acme', config: { board: 'acme', baseUrl: boards.url } }).expect(201);
    const run = await u.post(`/autoapply/sources/${src.body.id}/run`).expect(200);
    expect(run.body).toMatchObject({ found: 4, created: 4 });
    const strong = await leadBy('Senior Backend Engineer');
    expect(strong).toMatchObject({ status: 'READY_FOR_REVIEW', kitStatus: 'complete', atsType: 'greenhouse' });
    expect(strong.fitScore).toBeGreaterThanOrEqual(75);
    const detail = (await u.get(`/autoapply/leads/${strong.id}`)).body;
    expect(detail.fitBreakdown.skills.reason).toMatch(/Python/);
    expect(detail.fitExplanation).toMatch(/Strong match/);
    expect(detail.resume.label).toBe('Backend CV');
    expect(detail.applyKit.questionsFrom).toBe('ats');
    expect(detail.applyKit.answers.find((a: { key: string }) => a.key === 'question_1')).toMatchObject({ answer: 'AED 20,000 per month', source: 'standing' });
    expect(detail.recruiters[0].email).toBe('talent@acme.io'); // recruiter saved for later outreach
    expect((await leadBy('Marketing Manager')).status).toBe('EVALUATED');
    const london = await leadBy('Backend Engineer');
    expect(london.status).toBe('EVALUATED');
    expect(london.blockers.join()).toMatch(/Outside your locations/);
    expect(await prisma.application.count({ where: { workspace: { memberships: { some: { userId: u.userId } } } } })).toBe(0); // tracker untouched
  });

  it('dedupes across sources, records history, isolates failures and prevents overlapping scans', async () => {
    const lever = await u.post('/autoapply/sources', { type: 'LEVER', name: 'Beta', config: { board: 'beta', company: 'Acme', baseUrl: boards.url } }).expect(201);
    expect((await u.post(`/autoapply/sources/${lever.body.id}/run`).expect(200)).body).toMatchObject({ found: 1, created: 0 });
    const lead = await prisma.jobLead.findFirstOrThrow({ where: { title: 'Senior Backend Engineer', workspace: { memberships: { some: { userId: u.userId } } } } });
    expect(lead.seenCount).toBe(2);
    expect(lead.discoveredVia).toEqual(['Acme', 'Beta']);
    const down = await u.post('/autoapply/sources', { type: 'GREENHOUSE', name: 'Down', config: { board: 'down', baseUrl: boards.url } }).expect(201);
    expect((await u.post(`/autoapply/sources/${down.body.id}/run`).expect(200)).body.error).toMatch(/503/);
    expect((await prisma.jobSource.findUniqueOrThrow({ where: { id: down.body.id } })).lastError).toMatch(/503/);
    await prisma.jobSource.update({ where: { id: lever.body.id }, data: { leaseUntil: new Date(Date.now() + 60_000) } });
    await u.post(`/autoapply/sources/${lever.body.id}/run`).expect(409);
    await prisma.jobSource.update({ where: { id: lever.body.id }, data: { leaseUntil: null } });
    await u.post('/autoapply/sources', { type: 'GREENHOUSE', name: 'Bad', config: { board: '../etc' } }).expect(201).then((r) => u.post(`/autoapply/sources/${r.body.id}/run`).expect(200)).then((r) => expect(r.body.error).toMatch(/slug/));
  });

  it('only applies after approval, requires verified evidence and never submits twice', async () => {
    expect((await u.post('/autoapply/runner/claim', { runner: 'test' }).expect(200)).body.attempt).toBeNull(); // nothing approved yet
    const strong = await leadBy('Senior Backend Engineer');
    await u.patch(`/autoapply/leads/${strong.id}/status`, { status: 'APPROVED' }).expect(200);
    await atsGate();
    const c = (await u.post('/autoapply/runner/claim', { runner: 'test' }).expect(200)).body;
    expect(c).toMatchObject({ mode: 'prefill', lead: { id: strong.id, atsType: 'greenhouse' } });
    expect(c.lead.resume.fileName).toBe('cv.txt');
    expect((await u.post('/autoapply/runner/claim', { runner: 'test-2' })).body.attempt).toBeNull(); // claimed once only
    expect((await u.post(`/autoapply/runner/attempts/${c.attempt.id}/submit-intent`)).body).toEqual({ ok: true });
    expect((await u.post(`/autoapply/runner/attempts/${c.attempt.id}/submit-intent`)).body.ok).toBe(false);
    const done = await u.post(`/autoapply/runner/attempts/${c.attempt.id}/result`, { status: 'SUBMITTED', evidence: { confirmationText: 'Thank you for applying! We have received your application.', confirmationUrl: 'https://boards.example/acme/jobs/1/confirmation' } }).expect(200);
    expect(done.body).toMatchObject({ status: 'SUBMITTED', leadStatus: 'SUBMITTED' });
    await u.post(`/autoapply/runner/attempts/${c.attempt.id}/result`, { status: 'SUBMITTED' }).expect(409);
    await u.patch(`/autoapply/leads/${strong.id}/status`, { status: 'APPROVED' }).expect(400); // SUBMITTED → APPROVED not allowed

    // unverified "submitted" → needs attention, and the job is never retried automatically
    const py = await leadBy('Python Backend Engineer');
    await u.patch(`/autoapply/leads/${py.id}/status`, { status: 'APPROVED' }).expect(200);
    await atsGate();
    const c2 = (await u.post('/autoapply/runner/claim', { runner: 'test' })).body;
    await u.post(`/autoapply/runner/attempts/${c2.attempt.id}/submit-intent`).expect(200);
    const bad = await u.post(`/autoapply/runner/attempts/${c2.attempt.id}/result`, { status: 'SUBMITTED', evidence: { confirmationText: 'Please correct the errors below' } }).expect(200);
    expect(bad.body).toMatchObject({ status: 'NEEDS_ATTENTION', leadStatus: 'NEEDS_ATTENTION' });
    const again = await u.patch(`/autoapply/leads/${py.id}/status`, { status: 'APPROVED' });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/clicked Submit/);
    // only an explicit "I checked, it was not submitted" unlocks a retry (and it is audited)
    await u.patch(`/autoapply/leads/${py.id}/status`, { status: 'APPROVED', verifiedNotSubmitted: true }).expect(200);
    expect(await prisma.auditEvent.count({ where: { userId: u.userId, action: 'autoapply.verified_not_submitted' } })).toBe(1);
    await u.patch(`/autoapply/leads/${py.id}/status`, { status: 'SKIPPED' }).expect(200);
  });

  it('recovers crashed runners: retries before Submit, never after', async () => {
    const mk = await leadBy('Marketing Manager');
    await u.patch(`/autoapply/leads/${mk.id}/status`, { status: 'APPROVED' }).expect(200);
    await atsGate();
    const a = (await u.post('/autoapply/runner/claim', { runner: 'crashy' })).body;
    await prisma.applyAttempt.update({ where: { id: a.attempt.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    await app.get(TickService).tick('w');
    expect((await prisma.applyAttempt.findUniqueOrThrow({ where: { id: a.attempt.id } })).status).toBe('FAILED');
    expect((await prisma.jobLead.findUniqueOrThrow({ where: { id: mk.id } })).status).toBe('APPROVED');
    const b = (await u.post('/autoapply/runner/claim', { runner: 'crashy' })).body;
    expect(b).toMatchObject({ lead: { id: mk.id }, attempt: { attemptNo: 2 } });
    await u.post(`/autoapply/runner/attempts/${b.attempt.id}/submit-intent`).expect(200);
    await prisma.applyAttempt.update({ where: { id: b.attempt.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    await app.get(TickService).tick('w');
    expect((await prisma.applyAttempt.findUniqueOrThrow({ where: { id: b.attempt.id } })).status).toBe('NEEDS_ATTENTION');
    const lead = await prisma.jobLead.findUniqueOrThrow({ where: { id: mk.id } });
    expect(lead).toMatchObject({ status: 'NEEDS_ATTENTION' });
    expect(lead.statusReason).toMatch(/Possible submission/);
    await u.patch(`/autoapply/leads/${mk.id}/status`, { status: 'APPROVED' }).expect(409);
  });

  it('auto mode applies without a stop only when every guardrail passes', async () => {
    await u.put('/autoapply/config', { autoSubmit: true, minAutoApplyScore: 75, dailyApplyCap: 5 }).expect(200);
    boards.setLever([{ id: 'llm', text: 'LLM Engineer', categories: { location: 'Dubai' }, descriptionPlain: 'Python, FastAPI, PostgreSQL, Redis, RAG and LLM evaluation.', hostedUrl: 'https://jobs.example/beta/llm', applyUrl: 'https://jobs.example/beta/llm/apply' }]);
    const lever = (await u.get('/autoapply/sources')).body.find((s: { name: string }) => s.name === 'Beta');
    await u.post(`/autoapply/sources/${lever.id}/run`).expect(200);
    const llm = await leadBy('LLM Engineer');
    expect(llm).toMatchObject({ status: 'APPROVED', autoApproved: true, kitStatus: 'complete' });
    await u.put('/autoapply/config', { dailyApplyCap: 0 }).expect(200);
    await atsGate();
    expect((await u.post('/autoapply/runner/claim', { runner: 'auto' })).body.reason).toMatch(/Daily cap/);
    await u.put('/autoapply/config', { dailyApplyCap: 5 }).expect(200);
    const c = (await u.post('/autoapply/runner/claim', { runner: 'auto' })).body;
    expect(c).toMatchObject({ mode: 'auto', lead: { id: llm.id } });
    await u.put('/autoapply/config', { autoSubmit: false }).expect(200);
    expect((await u.post(`/autoapply/runner/attempts/${c.attempt.id}/submit-intent`)).body).toMatchObject({ ok: false, reason: /turned off/ });
    await u.post(`/autoapply/runner/attempts/${c.attempt.id}/result`, { status: 'BLOCKED', error: 'CAPTCHA shown' }).expect(200);
    expect((await prisma.jobLead.findUniqueOrThrow({ where: { id: llm.id } })).statusReason).toMatch(/Blocked: CAPTCHA/);
  });

  it('alert emails, manual submission with evidence, tracker hand-off and recruiter contacts', async () => {
    const html = '<a href="https://www.linkedin.com/comm/jobs/view/4099999999/?trackingId=1">Platform Engineer</a><p>Globex</p><p>Dubai</p>';
    const imp = (await u.post('/autoapply/import/alert', { content: html }).expect(201)).body;
    expect(imp).toMatchObject({ found: 1, created: 1 });
    const li = (await u.get(`/autoapply/leads/${imp.leads[0].id}`)).body;
    expect(li).toMatchObject({ atsType: 'linkedin', automatable: false, canonicalUrl: 'https://www.linkedin.com/jobs/view/4099999999/' });
    await u.patch(`/autoapply/leads/${li.id}/status`, { status: 'APPROVED' }).expect(200);
    expect((await u.post('/autoapply/runner/claim', { runner: 'x' })).body.attempt).toBeNull(); // LinkedIn is never automated
    await u.post(`/autoapply/leads/${li.id}/submitted`, {}).expect(400);
    await u.post(`/autoapply/leads/${li.id}/submitted`, { note: 'Applied on LinkedIn with Easy Apply' }).expect(200);
    expect((await prisma.jobLead.findUniqueOrThrow({ where: { id: li.id } })).status).toBe('SUBMITTED');
    await u.post('/autoapply/import/url', { url: 'http://127.0.0.1:1/job' }).expect(400); // SSRF guard on pasted URLs

    const strong = await leadBy('Senior Backend Engineer');
    const moved = (await u.post(`/autoapply/leads/${strong.id}/move-to-tracker`).expect(200)).body;
    expect((await u.post(`/autoapply/leads/${strong.id}/move-to-tracker`).expect(200)).body).toMatchObject({ applicationId: moved.applicationId, existing: true });
    expect((await u.get(`/applications/${moved.applicationId}`).expect(200)).body).toMatchObject({ companyName: 'Acme', status: 'Applied' });

    await u.post('/autoapply/recruiters', { name: 'Dana Lee', email: 'dana@globex.example', company: 'Globex', leadId: li.id }).expect(201);
    await u.post('/autoapply/recruiters/extract', { text: 'From: "Omar Khan" <omar@initech.example>\nHi! +971 50 123 4567 https://www.linkedin.com/in/omar-khan' }).expect(200);
    const list = (await u.get('/autoapply/recruiters')).body;
    expect(list.map((r: { email: string }) => r.email)).toEqual(expect.arrayContaining(['talent@acme.io', 'dana@globex.example', 'omar@initech.example']));
    expect(list.find((r: { email: string }) => r.email === 'omar@initech.example')).toMatchObject({ name: 'Omar Khan', linkedinUrl: 'https://www.linkedin.com/in/omar-khan' });
    const csv = await u.get('/autoapply/recruiters/export.csv').expect(200);
    expect(csv.text).toContain('dana@globex.example');
  });

  it('the Claude skill path always runs in a browser agent session and validates its evidence', async () => {
    const html = '<a href="https://www.linkedin.com/comm/jobs/view/4088888888/">Data Engineer</a><p>Hooli</p><p>Dubai</p>';
    const id = (await u.post('/autoapply/import/alert', { content: html })).body.leads[0].id;
    await u.patch(`/autoapply/leads/${id}/status`, { status: 'APPROVED' }).expect(200);
    config.claudeCli.enabled = true; // even with the headless CLI enabled, applying is not routed to it
    const task = (await u.post(`/autoapply/leads/${id}/agent-task`).expect(201)).body;
    config.claudeCli.enabled = false;
    expect(task).toMatchObject({ type: 'job_application', state: 'ready_for_agent', executionMethod: 'agent_manual' });
    await u.post(`/tasks/${task.id}/retry`, { method: 'llm' }).expect(400);
    const pkg = (await u.post(`/tasks/${task.id}/handoff`).expect(200)).body.package;
    expect(pkg.skill).toBe('icc-auto-apply');
    expect(pkg.context.job.applyUrl).toMatch(/linkedin/);
    await u.post(`/tasks/${task.id}/import`, { output: { status: 'SUBMITTED', notes: 'clicked submit' } }).expect(200);
    expect((await prisma.jobLead.findUniqueOrThrow({ where: { id } })).status).toBe('NEEDS_ATTENTION'); // no confirmation → not counted
  });

  it('isolates users completely', async () => {
    const theirs = await leadBy('Senior Backend Engineer');
    expect((await other.get('/autoapply/leads')).body).toEqual([]);
    expect((await other.get('/autoapply/sources')).body).toEqual([]);
    expect((await other.get('/autoapply/recruiters')).body).toEqual([]);
    expect((await other.get(`/autoapply/leads/${theirs.id}`)).status).toBe(404);
    expect((await other.patch(`/autoapply/leads/${theirs.id}/status`, { status: 'SKIPPED' })).status).toBe(404);
    expect((await other.post(`/autoapply/leads/${theirs.id}/move-to-tracker`)).status).toBe(404);
    expect((await other.post('/autoapply/runner/claim', { runner: 'thief' })).body.attempt).toBeNull();
    const att = await prisma.applyAttempt.findFirstOrThrow({ where: { leadId: theirs.id } });
    expect((await other.post(`/autoapply/runner/attempts/${att.id}/result`, { status: 'FAILED' })).status).toBe(404);
    expect((await other.get(`/autoapply/attempts/${att.id}/screenshot`)).status).toBe(404);
  });

  it('runner tokens are personal, listable and revocable', async () => {
    const t = (await u.post('/autoapply/runner-tokens', { label: 'macbook' }).expect(201)).body;
    const auth = { Authorization: `Bearer ${t.token}` };
    await u.raw().post('/api/autoapply/runner/claim').set(auth).send({ runner: 'mac' }).expect(200);
    expect((await u.get('/autoapply/runner-tokens')).body.map((x: { label: string }) => x.label)).toContain('macbook');
    await u.del(`/autoapply/runner-tokens/${t.id}`).expect(200);
    await u.raw().post('/api/autoapply/runner/claim').set(auth).send({ runner: 'mac' }).expect(401);
  });
  it('finds jobs by role through a search provider, keeps the key secret and respects the budget', async () => {
    await u.put('/autoapply/config', { preferences: { ...(await u.get('/autoapply/presets')).body['UAE · Backend & AI'], sites: ['linkedin', 'company'] } }).expect(200);
    const saved = await u.put('/autoapply/providers/GOOGLE_JOBS', { apiKey: 'serp-secret-9876', baseUrl: boards.url, monthlyBudget: 3 }).expect(200);
    expect(saved.body).toMatchObject({ hasKey: true, apiKeyLast4: '9876', enabled: true, usedThisMonth: 0 });
    const row = await prisma.jobSource.findFirstOrThrow({ where: { id: saved.body.id } });
    expect(JSON.stringify(row.config)).not.toContain('serp-secret');
    for (const path of ['/autoapply/sources', '/autoapply/overview', '/autoapply/providers']) expect(JSON.stringify((await u.get(path)).body)).not.toMatch(/serp-secret|apiKeyEnc/);

    const run = await u.post(`/autoapply/sources/${saved.body.id}/run`).expect(200);
    expect(run.body.created).toBe(1); // the Bayt-only listing is outside the allowed sites
    expect(boards.searches).toHaveLength(3); // capped by the monthly budget
    expect(boards.searches[0]).toMatch(/engine=google_jobs/);
    expect(boards.searches[0]).toMatch(/q=Senior\+Backend\+Engineer\+Dubai/);
    expect(boards.searches[0]).toMatch(/gl=ae/);
    const lead = await leadBy('Platform Backend Engineer');
    expect(lead).toMatchObject({ company: 'Zeta', sourceType: 'GOOGLE_JOBS', atsType: 'other' });
    const detail = (await u.get(`/autoapply/leads/${lead.id}`)).body;
    expect(detail.applyUrl).toBe('https://careers.zeta.example/jobs/1'); // company page preferred over LinkedIn
    expect(detail.discoveredVia).toEqual(['Google Jobs · Company careers page']);

    expect((await u.get('/autoapply/providers')).body.find((p: { type: string }) => p.type === 'GOOGLE_JOBS').usedThisMonth).toBe(3);
    await prisma.jobSource.update({ where: { id: saved.body.id }, data: { leaseUntil: null } });
    expect((await u.post(`/autoapply/sources/${saved.body.id}/run`).expect(200)).body.error).toMatch(/Monthly budget of 3/);
    expect(boards.searches).toHaveLength(3);

    // other workspaces see nothing of it; board config cannot overwrite the encrypted key
    expect((await other.get('/autoapply/providers')).body.every((p: { hasKey: boolean }) => !p.hasKey)).toBe(true);
    await u.patch(`/autoapply/sources/${saved.body.id}`, { config: { board: 'x' } }).expect(404);
    await u.put('/autoapply/providers/NOPE', {}).expect(404);
  });

  it('a search slower than the proxy timeout answers "running" and finishes in the background', async () => {
    const before = boards.searches.length;
    await u.put('/autoapply/config', { preferences: { ...(await u.get('/autoapply/config')).body.preferences, titles: ['slow role'], maxSearchQueries: 1 } }).expect(200);
    const id = (await u.get('/autoapply/providers')).body.find((p: { type: string }) => p.type === 'GOOGLE_JOBS').id;
    await u.put('/autoapply/providers/GOOGLE_JOBS', { monthlyBudget: 50 }).expect(200);
    const t = Date.now();
    const r = await u.post(`/autoapply/sources/${id}/run`).expect(200);
    expect(r.body).toEqual({ found: 0, created: 0, running: true });
    expect(Date.now() - t).toBeLessThan(4500);
    await u.post(`/autoapply/sources/${id}/run`).expect(409); // still leased
    for (let i = 0; i < 40 && (await prisma.jobSource.findUniqueOrThrow({ where: { id } })).leaseUntil; i++) await new Promise((ok) => setTimeout(ok, 250));
    const src = await prisma.jobSource.findUniqueOrThrow({ where: { id } });
    expect(src.leaseUntil).toBeNull();
    expect(src.lastSuccessAt!.getTime()).toBeGreaterThan(t + 4000);
    expect(boards.searches.length).toBe(before + 1);
  });
});
