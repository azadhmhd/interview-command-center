import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { boot, Client, register } from './helpers';

describe('Multi-user privacy, sharing and auth (spec §15, #18, #19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alice: Client;
  let bob: Client;
  let ids: { app: string; round: string; occ: string; course: string; canonical: string; resume: string; task: string };

  beforeAll(async () => {
    app = await boot();
    prisma = app.get(PrismaService);
    alice = await register(app, 'Alice');
    bob = await register(app, 'Bob');
    const a = await alice.post('/applications', { companyName: 'Initech', jobTitle: 'Staff Engineer', jobDescription: 'Secret JD' }).expect(201);
    const r = await alice.post(`/applications/${a.body.id}/rounds`, { type: 'backend', scheduledAt: new Date(Date.now() + 5 * 864e5).toISOString() }).expect(201);
    const q = await alice.post(`/rounds/${r.body.id}/questions`, { prompt: 'Explain Postgres MVCC', originalAnswer: 'Alice private answer' }).expect(201);
    const c = await alice.post(`/rounds/${r.body.id}/prepare`, {}).expect(201);
    const cv = await alice.raw().post('/api/resumes').set(alice.auth).attach('file', Buffer.from('Alice CV text'), { filename: 'cv.txt', contentType: 'text/plain' }).expect(201);
    ids = { app: a.body.id, round: r.body.id, occ: q.body.id, course: c.body.course.id, canonical: q.body.canonicalQuestionId, resume: cv.body.id, task: c.body.task.id };
  });
  afterAll(async () => app.close());

  it('#18 a second user cannot read or modify private data through direct API requests', async () => {
    expect((await bob.get('/applications')).body).toEqual([]);
    expect((await bob.get('/rounds')).body).toEqual([]);
    expect((await bob.get('/courses')).body).toEqual([]);
    expect((await bob.get('/questions')).body).toEqual([]);
    expect((await bob.get('/tasks')).body).toEqual([]);
    expect((await bob.get('/resumes')).body).toEqual([]);
    expect((await bob.get('/search?q=MVCC')).body).toEqual({ occurrences: [], canonical: [] });
    const reads = [
      `/applications/${ids.app}`, `/rounds/${ids.round}`, `/occurrences/${ids.occ}`, `/courses/${ids.course}`, `/questions/${ids.canonical}`,
      `/resumes/${ids.resume}`, `/resumes/${ids.resume}/file`, `/tasks/${ids.task}`, `/tasks/${ids.task}/package`, `/shared/courses/${ids.course}`,
    ];
    for (const url of reads) expect([url, (await bob.get(url)).status]).toEqual([url, 404]);
    const writes: [string, string, object][] = [
      ['patch', `/applications/${ids.app}`, { status: 'Rejected' }],
      ['del', `/applications/${ids.app}`, {}],
      ['post', `/applications/${ids.app}/rounds`, { type: 'backend' }],
      ['patch', `/rounds/${ids.round}`, { notes: 'pwned' }],
      ['post', `/rounds/${ids.round}/questions`, { prompt: 'Injected question?' }],
      ['patch', `/occurrences/${ids.occ}`, { improvedAnswer: 'pwned' }],
      ['post', `/rounds/${ids.round}/prepare`, {}],
      ['post', `/tasks/${ids.task}/handoff`, {}],
      ['post', `/tasks/${ids.task}/import`, { output: {} }],
      ['post', '/practice/attempts', { occurrenceId: ids.occ, answer: 'x' }],
      ['post', `/revision/${ids.canonical}/review`, { grade: 5 }],
      ['post', '/shares', { resourceType: 'APPLICATION', resourceId: ids.app, email: bob.email }],
    ];
    for (const [m, url, body] of writes) {
      const res = await (bob as unknown as Record<string, (u: string, b: object) => request.Test>)[m](url, body);
      expect([m, url, res.status]).toEqual([m, url, 404]);
    }
    // Using Alice's workspace id directly is refused.
    const ws = (await alice.get('/auth/me')).body.workspaceId;
    expect((await bob.get('/applications').set('x-workspace-id', ws)).status).toBe(403);
    // Nothing changed.
    const occ = await prisma.interviewQuestionOccurrence.findUniqueOrThrow({ where: { id: ids.occ } });
    expect(occ.improvedAnswer).toBeNull();
    expect((await prisma.application.findUniqueOrThrow({ where: { id: ids.app } })).status).toBe('Saved');
    // Unauthenticated requests are rejected.
    expect((await request(app.getHttpServer()).get('/api/applications')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/applications').set('Authorization', 'Bearer forged')).status).toBe(401);
  });

  it('#19 explicit sharing respects permissions and revocation; shared courses expose no source records', async () => {
    const s1 = await alice.post('/shares', { resourceType: 'COURSE', resourceId: ids.course, email: bob.email, permission: 'VIEW' }).expect(201);
    const listed = await bob.get('/shared').expect(200);
    expect(listed.body.map((x: { resourceId: string }) => x.resourceId)).toContain(ids.course);
    const shared = await bob.get(`/shared/courses/${ids.course}`).expect(200);
    expect(shared.body.course.lessons.length).toBeGreaterThan(0);
    const body = JSON.stringify(shared.body);
    expect(body).not.toContain('Alice private answer');
    expect(body).not.toContain('Secret JD');
    expect(body).not.toContain('contextSnapshot');
    expect(shared.body.course.overview.context).toBeUndefined();
    // course share does not open the source application, round or questions
    expect((await bob.get(`/shared/applications/${ids.app}`)).status).toBe(404);
    expect((await bob.get(`/applications/${ids.app}`)).status).toBe(404);
    expect((await bob.get(`/occurrences/${ids.occ}`)).status).toBe(404);
    // VIEW cannot edit
    const lessonId = shared.body.course.lessons[0].id;
    expect((await bob.patch(`/shared/courses/${ids.course}/lessons/${lessonId}`, { explanation: 'edited' })).status).toBe(403);
    // upgrade to EDIT → can edit
    await alice.post('/shares', { resourceType: 'COURSE', resourceId: ids.course, email: bob.email, permission: 'EDIT' }).expect(201);
    await bob.patch(`/shared/courses/${ids.course}/lessons/${lessonId}`, { explanation: 'Mentor edit' }).expect(200);
    expect((await prisma.preparationModule.findUniqueOrThrow({ where: { id: lessonId } })).explanation).toBe('Mentor edit');
    // revoke → immediately gone
    await alice.del(`/shares/${s1.body.id}`).expect(200);
    expect((await bob.get(`/shared/courses/${ids.course}`)).status).toBe(404);
    expect((await bob.patch(`/shared/courses/${ids.course}/lessons/${lessonId}`, { explanation: 'after revoke' })).status).toBe(404);
    // application share (view) shows the journal but cannot add notes; edit can
    const s2 = await alice.post('/shares', { resourceType: 'APPLICATION', resourceId: ids.app, email: bob.email }).expect(201);
    const sa = await bob.get(`/shared/applications/${ids.app}`).expect(200);
    expect(sa.body.application.rounds[0].occurrences[0].originalAnswer).toBe('Alice private answer');
    expect((await bob.post(`/shared/applications/${ids.app}/notes`, { message: 'hi' })).status).toBe(403);
    await alice.del(`/shares/${s2.body.id}`).expect(200);
    expect((await bob.get(`/shared/applications/${ids.app}`)).status).toBe(404);
    // cannot share something you don't own; audit trail recorded
    expect((await bob.post('/shares', { resourceType: 'COURSE', resourceId: ids.course, email: alice.email })).status).toBe(404);
    const audit = await prisma.auditEvent.findMany({ where: { userId: alice.userId, action: { startsWith: 'share.' } } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['share.grant', 'share.revoke']));
  });

  it('team workspaces: invitations, roles (viewer read-only) and removal', async () => {
    const ws = await alice.post('/workspaces', { name: 'Mentoring' }).expect(201);
    const h = { 'x-workspace-id': ws.body.id };
    expect((await alice.post('/workspaces/current/invitations', { email: bob.email, role: 'VIEWER' })).status).toBe(400); // personal ws is private
    const inv = await alice.raw().post('/api/workspaces/current/invitations').set(alice.auth).set(h).send({ email: bob.email, role: 'VIEWER' }).expect(201);
    const carol = await register(app, 'Carol');
    expect((await carol.post('/workspaces/invitations/accept', { token: inv.body.token })).status).toBe(403); // wrong email
    await bob.post('/workspaces/invitations/accept', { token: inv.body.token }).expect(201);
    await alice.raw().post('/api/applications').set(alice.auth).set(h).send({ companyName: 'Shared Co', jobTitle: 'Engineer' }).expect(201);
    const seen = await bob.get('/applications').set(h).expect(200);
    expect(seen.body.map((a: { companyName: string }) => a.companyName)).toEqual(['Shared Co']);
    expect((await bob.post('/applications', { companyName: 'Nope', jobTitle: 'X' }).set(h)).status).toBe(403); // viewer cannot write
    expect((await bob.get('/applications')).body).toEqual([]); // personal workspace stays separate
    const members = await alice.raw().get('/api/workspaces/current/members').set(alice.auth).set(h).expect(200);
    const bobMember = members.body.members.find((m: { email: string }) => m.email === bob.email);
    await alice.raw().delete(`/api/workspaces/current/members/${bobMember.id}`).set(alice.auth).set(h).expect(200);
    expect((await bob.get('/applications').set(h)).status).toBe(403);
    expect((await bob.raw().put('/api/llm/config').set(bob.auth).send({ baseUrl: 'http://localhost:1/v1', model: 'x' })).status).toBe(200); // owner of own ws
  });

  it('password reset, logout and session revocation', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'nobody@example.test' }).expect(200); // no account enumeration
    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: alice.email }).expect(200);
    const link = String(warn.mock.calls.map((c) => c[0]).find((m) => String(m).includes(alice.email)));
    warn.mockRestore();
    const token = link.split('token=')[1];
    expect(token).toBeTruthy();
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token, password: 'a-brand-new-password' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token, password: 'another-new-password' }).expect(400); // single use
    expect((await alice.get('/auth/me')).status).toBe(401); // all sessions revoked
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: alice.email, password: 'correct-horse-battery' }).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: alice.email, password: 'a-brand-new-password' }).expect(200);
    expect(login.headers['set-cookie'][0]).toMatch(/icc_session=.*HttpOnly.*SameSite=Lax/i);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('account deletion removes the user and their private workspace data', async () => {
    const dave = await register(app, 'Dave');
    const a = await dave.post('/applications', { companyName: 'Doomed', jobTitle: 'Engineer' }).expect(201);
    expect((await dave.del('/account', { password: 'wrong', confirm: 'DELETE' })).status).toBe(401);
    await dave.del('/account', { password: 'correct-horse-battery', confirm: 'DELETE' }).expect(200);
    expect(await prisma.application.findUnique({ where: { id: a.body.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: dave.email } })).toBeNull();
    expect((await dave.get('/auth/me')).status).toBe(401);
  });
});
