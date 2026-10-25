import { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import { extractHeadingIcons } from '../src/builder/icons';
import { PrismaService } from '../src/prisma.service';
import { TaskRunner } from '../src/tasks/runner';
import { boot, Client, fakeLlm, IMPORTED_RESUME, register } from './helpers';

describe('Resume builder', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let runner: TaskRunner;
  let u: Client;
  let other: Client;
  let llm: Awaited<ReturnType<typeof fakeLlm>>;
  let appId: string;
  let leadId: string;

  beforeAll(async () => {
    app = await boot();
    prisma = app.get(PrismaService);
    runner = app.get(TaskRunner);
    llm = await fakeLlm();
    u = await register(app, 'Builder');
    other = await register(app, 'Stranger');
    await u.put('/profile', { fullName: 'Sam Rivera', headline: 'Backend Engineer', summary: 'Seven years of Python.', coreTech: ['Python', 'Django'] }).expect(200);
    appId = (await u.post('/applications', { companyName: 'Acme', jobTitle: 'Senior Backend Engineer', jobDescription: 'Python, Kafka, PostgreSQL' }).expect(201)).body.id;
    const ws = (await u.get('/auth/me')).body.workspaceId as string;
    leadId = (await prisma.jobLead.create({ data: { workspaceId: ws, sourceType: 'MANUAL_URL', canonicalUrl: 'https://jobs.example/1', title: 'Python Developer', company: 'Beta', dedupeKey: 'beta|python developer', description: 'Python, FastAPI' } })).id;
  });
  afterAll(async () => { await llm.close(); await app.close(); });

  it('starts a resume from the profile, saves edits and refuses stale saves', async () => {
    const d = (await u.post('/resume-drafts', {}).expect(201)).body;
    const full = (await u.get(`/resume-drafts/${d.id}`).expect(200)).body;
    expect(full.content.header).toMatchObject({ fullName: 'Sam Rivera', headline: 'Backend Engineer' });
    expect(full.design.template).toBe('classic-serif');

    const content = { ...full.content, header: { ...full.content.header, links: [{ label: 'site', url: 'sam.dev' }, { label: 'bad', url: 'javascript:alert(1)' }] } };
    const saved = (await u.put(`/resume-drafts/${d.id}`, { title: 'Master CV', content, baseUpdatedAt: full.updatedAt }).expect(200)).body;
    expect(saved.title).toBe('Master CV');
    expect(saved.content.header.links).toEqual([{ label: 'site', url: 'https://sam.dev' }, { label: 'bad', url: '' }]);
    // a second tab still holding the old version cannot overwrite the newer save
    await u.put(`/resume-drafts/${d.id}`, { title: 'Old tab', baseUpdatedAt: full.updatedAt }).expect(409);
    await u.put(`/resume-drafts/${d.id}`, { design: { ...full.design, template: 'nope' } }).expect(400);
  });

  it('makes unlimited copies with the same design, linked to an application or a job lead', async () => {
    const master = (await u.post('/resume-drafts', { title: 'Master' }).expect(201)).body;
    await u.put(`/resume-drafts/${master.id}`, { design: { template: 'classic-serif', accent: '#1d4ed8', fontScale: 0.95, marginMm: 12, pageFormat: 'A4', headingIcons: true, footer: true } }).expect(200);
    const forApp = (await u.post(`/resume-drafts/${master.id}/duplicate`, { applicationId: appId }).expect(201)).body;
    expect(forApp).toMatchObject({ title: 'Acme – Senior Backend Engineer', applicationId: appId, sourceDraftId: master.id });
    expect((await u.get(`/resume-drafts/${forApp.id}`)).body.design.accent).toBe('#1d4ed8');
    const forLead = (await u.post(`/resume-drafts/${master.id}/duplicate`, { jobLeadId: leadId }).expect(201)).body;
    expect(forLead).toMatchObject({ title: 'Beta – Python Developer', jobLeadId: leadId });
    for (let i = 0; i < 3; i++) await u.post(`/resume-drafts/${master.id}/duplicate`).expect(201);
    expect((await u.get(`/resume-drafts?applicationId=${appId}`)).body.map((x: { id: string }) => x.id)).toEqual([forApp.id]);
    expect((await u.get('/resume-drafts')).body.filter((x: { sourceDraftId: string }) => x.sourceDraftId === master.id)).toHaveLength(5);
  });

  it('keeps drafts private to the workspace', async () => {
    const d = (await u.post('/resume-drafts', {}).expect(201)).body;
    await other.get(`/resume-drafts/${d.id}`).expect(404);
    await other.put(`/resume-drafts/${d.id}`, { title: 'x' }).expect(404);
    await other.post(`/resume-drafts/${d.id}/duplicate`).expect(404);
    await other.del(`/resume-drafts/${d.id}`).expect(404);
    expect((await other.get('/resume-drafts')).body).toEqual([]);
    // cannot link a copy to someone else's application
    const mine = (await other.post('/resume-drafts', {}).expect(201)).body;
    await other.post(`/resume-drafts/${mine.id}/duplicate`, { applicationId: appId }).expect(404);
    await u.del(`/resume-drafts/${d.id}`).expect(200);
    await u.get(`/resume-drafts/${d.id}`).expect(404);
  });

  const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };
  const pdfOn = !!process.env.TEST_WEB_URL;

  (pdfOn ? it.skip : it)('says clearly when PDF rendering is off', async () => {
    const d = (await u.post('/resume-drafts', {}).expect(201)).body;
    const r = await u.get(`/resume-drafts/${d.id}/pdf`).expect(503);
    expect(r.body.message).toMatch(/PDF_ENABLED=false/);
  });

  (pdfOn ? it : it.skip)('renders the PDF and publishes job copies as CVs attached to that job', async () => {
    const master = (await u.post('/resume-drafts', { title: 'Master' }).expect(201)).body;
    const pdf = await u.get(`/resume-drafts/${master.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('Sam Rivera.pdf');
    expect(Number(pdf.headers['x-page-count'])).toBeGreaterThanOrEqual(1);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // heading icons survive a PDF round trip: render with stored icons, read them back out of the PDF
    const icon = { viewBox: '0 0 512 512', d: 'M0 0L512 0L512 512L0 512Z' };
    const m = (await u.get(`/resume-drafts/${master.id}`)).body;
    await u.put(`/resume-drafts/${master.id}`, { design: { ...m.design, icons: { skills: icon } } }).expect(200);
    const withIcons = await u.get(`/resume-drafts/${master.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect(await extractHeadingIcons(withIcons.body as Buffer)).toEqual([{ title: 'SKILLS', ...icon }]);
    await u.put(`/resume-drafts/${master.id}`, { design: m.design }).expect(200);

    const forApp = (await u.post(`/resume-drafts/${master.id}/duplicate`, { applicationId: appId }).expect(201)).body;
    const before = (await u.get(`/resume-drafts/${forApp.id}`)).body;
    const pub = (await u.post(`/resume-drafts/${forApp.id}/publish`).expect(201)).body;
    expect(pub.resume).toMatchObject({ label: 'Acme – Senior Backend Engineer', version: 1, mimeType: 'application/pdf', structuredStatus: 'confirmed' });
    expect(pub.resume.storagePath).toBeUndefined();
    expect((await u.get(`/applications/${appId}`)).body.resume.id).toBe(pub.resume.id);
    const cv = (await u.get(`/resumes/${pub.resume.id}`)).body;
    expect(cv.extractedText).toContain('Sam Rivera');
    expect(cv.structured.name).toBe('Sam Rivera');
    const file = await u.get(`/resumes/${pub.resume.id}/file`).buffer(true).parse(binary).expect(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // publishing is not an edit: the open editor can keep saving
    await u.put(`/resume-drafts/${forApp.id}`, { title: 'Acme – Senior Backend Engineer', baseUpdatedAt: before.updatedAt }).expect(200);
    expect((await u.post(`/resume-drafts/${forApp.id}/publish`).expect(201)).body.resume.version).toBe(2);

    const forLead = (await u.post(`/resume-drafts/${master.id}/duplicate`, { jobLeadId: leadId }).expect(201)).body;
    const leadPub = (await u.post(`/resume-drafts/${forLead.id}/publish`).expect(201)).body;
    const lead = await prisma.jobLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.resumeId).toBe(leadPub.resume.id);
    expect(JSON.stringify(lead.applyKit)).toContain('Beta – Python Developer'); // kit rebuilt to attach this CV
    await other.post(`/resume-drafts/${forLead.id}/publish`).expect(404);
  });

  it('imports an uploaded CV into an editable draft through the AI task', async () => {
    const cv = await u.raw().post('/api/resumes').set(u.auth).field('label', 'Old CV').attach('file', Buffer.from('Sam Rivera\nBackend Engineer\nSkills\nBackend & Languages: Python, Django, FastAPI'), { filename: 'cv.txt', contentType: 'text/plain' }).expect(201);
    await u.put('/llm/config', { baseUrl: llm.url, apiKey: 'test-key', model: 'fake-model' }).expect(200);
    const task = (await u.post('/resume-drafts/import', { resumeId: cv.body.id }).expect(201)).body;
    expect(task).toMatchObject({ type: 'resume_draft_import', state: 'queued' });
    expect(await runner.run(task.id, 'test-worker')).toBe('ran');
    const done = (await u.get(`/tasks/${task.id}`)).body;
    expect(done.state).toMatch(/completed|awaiting_review/);
    const d = (await u.get(`/resume-drafts/${done.outputRef.draftId}`).expect(200)).body;
    expect(d.title).toBe('Old CV (imported)');
    expect(d.content.header.links[0].url).toBe('https://linkedin.com/in/samrivera');
    expect(d.content.sections[1].groups[0]).toMatchObject({ label: 'Backend & Languages', items: IMPORTED_RESUME.sections[1].groups![0].items });
    await other.post('/resume-drafts/import', { resumeId: cv.body.id }).expect(404);
  });

  it('tailors a job copy with AI without touching the master or inventing numbers', async () => {
    const master = (await u.post('/resume-drafts', { title: 'Tailor master' }).expect(201)).body;
    const m = (await u.get(`/resume-drafts/${master.id}`)).body;
    const content = { ...m.content, sections: [
      ...m.content.sections.filter((s: { kind: string }) => s.kind !== 'experience'),
      { kind: 'experience', title: 'Work Experience', entries: [
        { title: 'Senior Engineer', subtitle: 'Acme', bullets: ['Built the payments API for 2M users', 'Ran Kafka pipelines'] },
        { title: 'Engineer', subtitle: 'Beta', bullets: ['Wrote tests'] },
      ] },
    ] };
    await u.put(`/resume-drafts/${master.id}`, { content }).expect(200);
    await u.put('/llm/config', { baseUrl: llm.url, apiKey: 'test-key', model: 'fake-model' }).expect(200);

    const r = (await u.post(`/resume-drafts/${master.id}/tailor`, { applicationId: appId }).expect(201)).body;
    expect(r.draft).toMatchObject({ applicationId: appId, sourceDraftId: master.id });
    expect(r.task).toMatchObject({ type: 'resume_tailoring', state: 'queued' });
    expect(await runner.run(r.task.id, 'test-worker')).toBe('ran');
    const done = (await u.get(`/tasks/${r.task.id}`)).body;
    expect(done.outputRef).toMatchObject({ notes: 'Tailored for Acme', rejected: ['Engineer (added a number that is not in your resume)'] });

    const exp = (d: { content: { sections: { kind: string; entries: { bullets: string[] }[] }[] } }) => d.content.sections.find((s) => s.kind === 'experience')!.entries;
    const copy = (await u.get(`/resume-drafts/${r.draft.id}`)).body;
    expect(exp(copy)[0].bullets).toEqual(['Ran Kafka pipelines', 'Built the payments API for 2M users']);
    expect(exp(copy)[1].bullets).toEqual(['Wrote tests']);
    expect(copy.content.sections.find((s: { kind: string }) => s.kind === 'skills').groups[0].items).toEqual(['Django', 'Python']);
    expect(exp((await u.get(`/resume-drafts/${master.id}`)).body)[0].bullets[0]).toBe('Built the payments API for 2M users'); // master unchanged

    const noJd = (await u.post('/applications', { companyName: 'Gamma', jobTitle: 'Engineer' }).expect(201)).body.id;
    const plain = (await u.post(`/resume-drafts/${master.id}/tailor`, { applicationId: noJd }).expect(201)).body;
    expect(plain).toMatchObject({ task: null, note: expect.stringMatching(/job description/) });
    await u.post(`/resume-drafts/${master.id}/tailor`, {}).expect(400);
    await other.post(`/resume-drafts/${master.id}/tailor`, { applicationId: appId }).expect(404);
  });
});
