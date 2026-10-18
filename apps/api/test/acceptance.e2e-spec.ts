import { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import { PrismaService } from '../src/prisma.service';
import { TickService } from '../src/scheduler/tick.service';
import { TaskRunner } from '../src/tasks/runner';
import { boot, Client, COURSE, EVALUATION, fakeLlm, register } from './helpers';

const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

describe('Interview Command Center — acceptance (spec §21)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let runner: TaskRunner;
  let u: Client;
  let appId: string;
  let roundId: string;
  let occId: string;

  beforeAll(async () => {
    app = await boot();
    prisma = app.get(PrismaService);
    runner = app.get(TaskRunner);
    u = await register(app, 'Alice');
  });
  afterAll(async () => app.close());

  it('#1 registers and creates a job application (with duplicate detection)', async () => {
    const me = await u.get('/auth/me').expect(200);
    expect(me.body.workspaces).toHaveLength(1);
    const res = await u.post('/applications', {
      companyName: 'Acme FZ-LLC', jobTitle: 'Senior Backend Engineer', status: 'Applied', priority: 'HIGH', salaryExpectation: 20000,
      jobDescription: 'Python, Django, PostgreSQL, Kafka and Redis. Build RAG features.',
    }).expect(201);
    appId = res.body.id;
    expect(res.body.appliedAt).toBeTruthy();
    const dup = await u.post('/applications', { companyName: 'acme', jobTitle: 'Senior Backend Engineer' }).expect(409);
    expect(dup.body.duplicates[0].id).toBe(appId);
    await u.post('/applications', { companyName: 'acme', jobTitle: 'Senior Backend Engineer', force: true }).expect(201);
    const followUp = await prisma.reminder.findFirst({ where: { applicationId: appId, kind: 'follow_up' } });
    expect(followUp).toBeTruthy();
    await u.post('/applications', { companyName: 'X', jobTitle: 'Y', status: 'Not A Status' }).expect(400);
  });

  it('#2 uploads and versions a resume (CV text extracted, structure left for review)', async () => {
    const cv = 'Jane Doe\nSenior engineer. Python, Django, FastAPI, PostgreSQL, Redis, Kafka.\n';
    const v1 = await u.raw().post('/api/resumes').set(u.auth).field('label', 'Backend CV').attach('file', Buffer.from(cv), { filename: 'cv.md', contentType: 'text/markdown' }).expect(201);
    const v2 = await u.raw().post('/api/resumes').set(u.auth).field('label', 'Backend CV').attach('file', Buffer.from(cv + 'Go.\n'), { filename: 'cv2.md', contentType: 'text/markdown' }).expect(201);
    expect([v1.body.version, v2.body.version]).toEqual([1, 2]);
    expect(v1.body.detectedTech).toEqual(expect.arrayContaining(['Python', 'Django', 'PostgreSQL']));
    expect(v1.body.isDefault).toBe(true);
    await u.raw().post('/api/resumes').set(u.auth).attach('file', Buffer.from('MZ\0\0binary'), { filename: 'x.exe', contentType: 'application/octet-stream' }).expect(400);
    await u.raw().post('/api/resumes').set(u.auth).attach('file', Buffer.from('not really a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
    await u.patch(`/applications/${appId}`, { resumeId: v2.body.id }).expect(200);
    // Structure extraction is AI work: with no LLM it waits for an agent instead of inventing anything.
    const t = await prisma.agentTask.findUnique({ where: { idempotencyKey: `resume_extraction:${v1.body.id}` } });
    expect(t?.state).toBe('ready_for_agent');
    const list = await u.get('/resumes').expect(200);
    expect(list.body).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain('storagePath');
  });

  it('#3 creates a custom sequence of interview rounds', async () => {
    const r1 = await u.post(`/applications/${appId}/rounds`, { type: 'recruiter_screen', title: 'Recruiter call', status: 'completed', outcome: 'passed' }).expect(201);
    const r2 = await u.post(`/applications/${appId}/rounds`, { type: 'system_design', title: 'System design', scheduledAt: days(3.5), durationMinutes: 60 }).expect(201);
    const r3 = await u.post(`/applications/${appId}/rounds`, { type: 'behavioral', title: 'Hiring manager' }).expect(201);
    roundId = r2.body.id;
    expect([r1.body.sequence, r2.body.sequence, r3.body.sequence]).toEqual([1, 2, 3]);
    await u.post(`/applications/${appId}/rounds/reorder`, { ids: [r1.body.id, r3.body.id, r2.body.id] }).expect(201);
    const detail = await u.get(`/applications/${appId}`).expect(200);
    expect(detail.body.rounds.map((r: { id: string }) => r.id)).toEqual([r1.body.id, r3.body.id, r2.body.id]);
    await u.post(`/applications/${appId}/rounds`, { type: 'not_a_type' }).expect(400);
    // Deterministic milestones were scheduled for the upcoming round.
    const milestones = await prisma.reminder.findMany({ where: { roundId, status: 'pending' } });
    expect(milestones.map((m) => m.kind)).toEqual(expect.arrayContaining(['prep_milestone', 'interview_day', 'post_interview']));
  });

  it('#4 records original questions, answers and mistakes (quick capture + notes import)', async () => {
    const q = await u.post(`/rounds/${roundId}/questions`, { prompt: 'Design a rate limiter for a public API' }).expect(201);
    occId = q.body.id;
    expect(q.body.source).toBe('REPORTED');
    await u.patch(`/occurrences/${occId}`, { originalAnswer: 'Token bucket per user in Redis.', conceptsMissed: ['sliding window', 'kafka partitions'], mistakes: 'Forgot multi-region', confidence: 2 }).expect(200);
    const notes = 'Q: How do you shard Postgres?\nA: By tenant id.\nWhat is MVCC?\nMulti-version concurrency control.';
    const imp = await u.post(`/rounds/${roundId}/questions/extract`, { text: notes }).expect(201);
    expect(imp.body.created).toHaveLength(2);
    expect(imp.body.created[0].originalAnswer).toBe('By tenant id.');
    const again = await u.post(`/rounds/${roundId}/questions/extract`, { text: notes }).expect(201);
    expect(again.body).toMatchObject({ created: [], skipped: 2 });
    const pub = await u.post(`/rounds/${roundId}/questions`, { prompt: 'Explain consistent hashing', source: 'PUBLIC_REPORT', sourceUrl: 'https://example.com/report' }).expect(201);
    expect(pub.body.source).toBe('PUBLIC_REPORT');
  });

  it('#9 preserves the original answer after corrections', async () => {
    const res = await u.patch(`/occurrences/${occId}`, { originalAnswer: 'A better answer' }).expect(409);
    expect(res.body.message).toMatch(/preserved/);
    await u.patch(`/occurrences/${occId}`, { improvedAnswer: 'Sliding window...', approvedAnswer: 'Final approved answer' }).expect(200);
    const o = await u.get(`/occurrences/${occId}`).expect(200);
    expect(o.body.originalAnswer).toBe('Token bucket per user in Redis.');
    expect(o.body.approvedAnswer).toBe('Final approved answer');
    expect(o.body.canonical.bestAnswer).toBe('Final approved answer');
  });

  let courseId: string;
  it('#5 #6 #15 generates a deterministic plan for the round with no LLM, reflecting JD, round, deadline and weaknesses', async () => {
    const llm = await u.get('/llm/config').expect(200);
    expect(llm.body.status).toMatchObject({ available: false, source: 'none' });
    const res = await u.post(`/rounds/${roundId}/prepare`, { mode: 'STANDARD' }).expect(201);
    courseId = res.body.course.id;
    expect(res.body.task).toMatchObject({ state: 'ready_for_agent', executionMethod: 'agent_manual' });
    expect(res.body.task.routingReason).toMatch(/No LLM endpoint configured/);
    const c = await u.get(`/courses/${courseId}`).expect(200);
    const keys = c.body.lessons.map((l: { key: string }) => l.key);
    expect(keys[0]).toBe('personal-review'); // recorded questions & mistakes come first
    expect(keys).toEqual(expect.arrayContaining(['sd-framework', 'queues-async', 'mock-interview', 'final-revision']));
    const checklist = JSON.stringify(c.body.overview.topicChecklist);
    expect(checklist).toMatch(/kafka/i); // job description
    expect(checklist).toMatch(/Previously weak/); // recorded weaknesses
    expect(c.body.overview.studyDays).toBe(3); // deadline (3.5 days away, standard mode)
    expect(c.body.overview.disclaimer).toMatch(/not known questions/);
    const personal = c.body.lessons[0];
    expect(personal.questions[0]).toMatchObject({ source: 'REPORTED' });
    // the scheduled milestone task was superseded by the manual prepare
    expect(await prisma.agentTask.count({ where: { roundId, type: 'course_generation', state: 'scheduled' } })).toBe(0);
    // unchanged context → reused, not regenerated
    const again = await u.post(`/rounds/${roundId}/prepare`, { mode: 'STANDARD' }).expect(201);
    expect(again.body).toMatchObject({ reused: true, task: null });
  });

  it('#7 #8 completes lessons, practices, self-evaluates without AI and retries', async () => {
    const c = await u.get(`/courses/${courseId}`).expect(200);
    const lesson = c.body.lessons.find((l: { key: string }) => l.key === 'sd-framework');
    expect(lesson.questions[0].modelAnswer).toBeUndefined(); // hidden before an attempt
    await u.patch(`/courses/${courseId}/lessons/${lesson.id}`, { status: 'completed' }).expect(200);
    const a1 = await u.post('/practice/attempts', { lessonId: lesson.id, questionIndex: 0, answer: 'Clarify requirements, then...', clientKey: 'attempt-key-0001' }).expect(201);
    expect(a1.body.selfEvaluationSuggested).toBe(true);
    expect(a1.body.task.state).toBe('ready_for_agent');
    const dup = await u.post('/practice/attempts', { lessonId: lesson.id, questionIndex: 0, answer: 'Clarify requirements, then...', clientKey: 'attempt-key-0001' }).expect(201);
    expect(dup.body.duplicate).toBe(true);
    await u.post(`/practice/attempts/${a1.body.attempt.id}/self-evaluation`, { rubric: { correctness: 4, completeness: 4, depth: 3, clarity: 5 }, missingConcepts: ['capacity estimates'] }).expect(201);
    expect((await prisma.agentTask.findUnique({ where: { id: a1.body.task.id } }))?.state).toBe('cancelled');
    const a2 = await u.post('/practice/attempts', { lessonId: lesson.id, questionIndex: 0, answer: 'Requirements, estimates, API, data model, deep dives.', evaluate: false }).expect(201);
    const view = await u.get(`/practice/attempts/${a2.body.attempt.id}`).expect(200);
    expect(view.body.previous.id).toBe(a1.body.attempt.id); // compare with previous attempt
    const course = await u.get(`/courses/${courseId}`).expect(200);
    expect(course.body.readiness.coverage).toBeGreaterThan(0);
    expect(course.body.readiness.note).toMatch(/does not predict/);
    const canon = await prisma.answerAttempt.findUniqueOrThrow({ where: { id: a1.body.attempt.id } });
    const cq = await prisma.canonicalQuestion.findUniqueOrThrow({ where: { id: canon.canonicalQuestionId! } });
    expect(cq.masteryStatus).toBe('learning'); // low self score feeds spaced repetition
  });

  it('#10 searches previously encountered questions and reuses them', async () => {
    const s = await u.get('/search?q=rate limiter').expect(200);
    expect(s.body.occurrences[0].id).toBe(occId);
    const lib = await u.get('/questions?q=MVCC').expect(200);
    expect(lib.body[0].prompt).toMatch(/MVCC/);
    // the same question at a different company links to the same canonical entry
    const other = await u.post('/applications', { companyName: 'Globex', jobTitle: 'Python Engineer' }).expect(201);
    const r = await u.post(`/applications/${other.body.id}/rounds`, { type: 'backend' }).expect(201);
    const q = await u.post(`/rounds/${r.body.id}/questions`, { prompt: 'design a rate limiter for a public API?' }).expect(201);
    const first = await u.get(`/occurrences/${occId}`).expect(200);
    expect(q.body.canonicalQuestionId).toBe(first.body.canonicalQuestionId);
    const canonical = await u.get(`/questions/${q.body.canonicalQuestionId}`).expect(200);
    expect(canonical.body.occurrences).toHaveLength(2);
    // revision queue
    const queue = await u.get('/revision/queue').expect(200);
    expect(queue.body.due.length).toBeGreaterThan(0);
    const reviewed = await u.post(`/revision/${queue.body.due[0].id}/review`, { grade: 5 }).expect(200);
    expect(new Date(reviewed.body.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('#12 manual agent handoff produces a valid package and validated import', async () => {
    const task = (await prisma.agentTask.findFirstOrThrow({ where: { courseId, type: 'course_generation' } }));
    const h = await u.post(`/tasks/${task.id}/handoff`).expect(200);
    expect(h.body.package).toMatchObject({ taskId: task.id, type: 'course_generation', skill: 'icc-prepare-interview', output: { path: 'output/result.json' } });
    expect(h.body.package.context.jobDescription).toMatch(/Kafka/);
    expect(h.body.package.context.pastQuestions.length).toBeGreaterThan(0);
    expect(h.body.package.outputSchema.type).toBe('object');
    expect(JSON.stringify(h.body.package)).not.toMatch(/passwordHash|apiKey|APP_ENCRYPTION_KEY/);
    const dir = join(config.agentWorkspaceDir, task.id);
    expect(existsSync(join(dir, 'TASK.md'))).toBe(true);
    expect(JSON.parse(await readFile(join(dir, 'task.json'), 'utf8')).taskId).toBe(task.id);
    await u.post(`/tasks/${task.id}/submitted`).expect(200);
    // invalid output is rejected and nothing is imported
    await writeFile(join(dir, 'output/result.json'), JSON.stringify({ lessons: [] }));
    const bad = await u.post(`/tasks/${task.id}/sync`).expect(400);
    expect(bad.body.issues.length).toBeGreaterThan(0);
    await writeFile(join(dir, 'output/result.json'), JSON.stringify(COURSE));
    const ok = await u.post(`/tasks/${task.id}/sync`).expect(200);
    expect(ok.body.task.state).toBe('completed'); // default: validated agent output applies and completes automatically
    const c = await u.get(`/courses/${courseId}`).expect(200);
    const fw = c.body.lessons.find((l: { key: string }) => l.key === 'sd-framework');
    expect(fw.status).toBe('completed'); // completed lesson kept, not overwritten
    expect(fw.title).not.toBe('Framework (AI-tailored)');
    expect(c.body.lessons.find((l: { key: string }) => l.key === 'flashcards')).toBeTruthy();
    // importing the same output twice is a no-op
    const lessonsBefore = await prisma.preparationModule.count({ where: { courseId } });
    const twice = await u.post(`/tasks/${task.id}/sync`).expect(200);
    expect(twice.body.duplicate).toBe(true);
    expect(await prisma.preparationModule.count({ where: { courseId } })).toBe(lessonsBefore);
    expect((await u.get(`/tasks/${task.id}`)).body.state).toBe('completed');
  });

  it('#16 unsupported agent integrations fall back to manual handoff', async () => {
    const st = await u.get('/agents/status').expect(200);
    expect(st.body.manual.available).toBe(true);
    expect(st.body.cursor.unattended).toBe(false);
    expect(st.body.claudeCli.enabled).toBe(false);
    const t = await u.post(`/applications/${appId}/research`).expect(201);
    expect(t.body).toMatchObject({ executionMethod: 'agent_manual', state: 'ready_for_agent' });
    await u.post(`/tasks/${t.body.id}/retry`).expect(400); // still no automatic executor → clear message, task retained
    const out = { sources: [{ url: 'https://example.com/acme-interviews', title: 'Acme interview guide', summary: 'Two technical rounds.', retrievedAt: '2026-10-01' }], patterns: [{ pattern: 'System design round', evidenceUrls: ['https://example.com/acme-interviews'] }], reportedQuestions: [{ prompt: 'Design a URL shortener', sourceUrl: 'https://example.com/acme-interviews' }], limitations: 'Only one public source found.' };
    // Opt-in approval: with reviewAiOutput on, the result is applied but waits for the user before completing.
    await u.put('/workspaces/current/settings', { reviewAiOutput: true }).expect(200);
    const imp = await u.post(`/tasks/${t.body.id}/import`, { output: out }).expect(200);
    expect(imp.body.task.state).toBe('awaiting_review');
    await u.post(`/tasks/${t.body.id}/approve`).expect(200);
    expect((await u.get(`/tasks/${t.body.id}`)).body.state).toBe('completed');
    await u.put('/workspaces/current/settings', { reviewAiOutput: false }).expect(200);
    const detail = await u.get(`/applications/${appId}`).expect(200);
    expect(detail.body.research[0].url).toBe('https://example.com/acme-interviews');
    const pub = await prisma.interviewQuestionOccurrence.findFirst({ where: { applicationId: appId, prompt: 'Design a URL shortener' } });
    expect(pub?.source).toBe('PUBLIC_REPORT'); // never confused with reported questions
  });

  describe('with a configured OpenAI-compatible endpoint', () => {
    let llm: Awaited<ReturnType<typeof fakeLlm>>;
    beforeAll(async () => { llm = await fakeLlm(); });
    afterAll(async () => llm.close());

    it('#14 invalid endpoints and credentials give clear errors; the key is never returned', async () => {
      const wrongKey = await u.post('/llm/test', { baseUrl: llm.url, apiKey: 'nope', model: 'fake-model' }).expect(200);
      expect(wrongKey.body).toMatchObject({ ok: false });
      expect(wrongKey.body.error).toMatch(/rejected the API key \(401\)/);
      const wrongModel = await u.post('/llm/test', { baseUrl: llm.url, apiKey: 'test-key', model: 'missing-model' }).expect(200);
      expect(wrongModel.body.error).toMatch(/404/);
      const down = await u.post('/llm/test', { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'x', model: 'm' }).expect(200);
      expect(down.body.error).toMatch(/Cannot reach 127\.0\.0\.1:1/);
      await u.put('/llm/config', { baseUrl: 'http://169.254.169.254/v1', model: 'm' }).expect(400);
      await u.put('/llm/config', { baseUrl: 'file:///etc/passwd', model: 'm' }).expect(400);
    });

    it('#13 uses the configured endpoint with no provider-specific logic', async () => {
      const saved = await u.put('/llm/config', { baseUrl: llm.url, apiKey: 'test-key', model: 'fake-model', evaluationModel: 'fake-eval' }).expect(200);
      expect(JSON.stringify(saved.body)).not.toContain('test-key');
      expect(saved.body.workspace).toMatchObject({ hasApiKey: true, apiKeyLast4: '-key' });
      const row = await prisma.lLMConfiguration.findFirstOrThrow({ where: { baseUrl: llm.url } });
      expect(row.apiKeyEncrypted).not.toContain('test-key'); // encrypted at rest
      const test = await u.post('/llm/test', {}).expect(200);
      expect(test.body).toMatchObject({ ok: true, modelListed: true, jsonMode: true });
      expect((await u.get('/llm/config')).body.status.available).toBe(true);

      // AI course generation through the worker path
      const res = await u.post(`/rounds/${roundId}/prepare`, { force: true }); if (res.status !== 201) console.log('DEBUG', res.body); expect(res.status).toBe(201);
      expect(res.body.task).toMatchObject({ state: 'queued', executionMethod: 'llm' });
      expect(await runner.run(res.body.task.id, 'test-worker')).toBe('ran');
      const done = await u.get(`/tasks/${res.body.task.id}`).expect(200);
      expect(done.body.state).toBe('completed');
      const course = await u.get(`/courses/${res.body.course.id}`).expect(200);
      expect(course.body.generator).toBe('llm');
      expect(course.body.overview.assumptions).toEqual(COURSE.assumptions);
      expect(course.body.lessons.find((l: { key: string }) => l.key === 'sd-framework').title).toBe('Framework (AI-tailored)');

      // answer evaluation uses the evaluation model profile
      const lesson = course.body.lessons.find((l: { key: string }) => l.key === 'sd-framework');
      const at = await u.post('/practice/attempts', { lessonId: lesson.id, questionIndex: 0, answer: 'Token bucket.' }).expect(201);
      expect(at.body.task.state).toBe('queued');
      await runner.run(at.body.task.id, 'test-worker');
      expect(llm.state.lastModel).toBe('fake-eval');
      const ev = await u.get(`/practice/attempts/${at.body.attempt.id}`).expect(200);
      expect(ev.body.evaluation).toMatchObject({ source: 'ai', score: EVALUATION.score, missingConcepts: ['sliding window'] });
      expect(ev.body.modelAnswer).toBe('Sliding window in Redis...'); // revealed after the attempt
      const usage = await u.get('/llm/usage').expect(200);
      expect(usage.body.recent.length).toBeGreaterThan(0);

      // improved answer never touches the original
      const imp = await u.post(`/occurrences/${occId}/improve`).expect(201);
      await runner.run(imp.body.id, 'test-worker');
      const occ = await u.get(`/occurrences/${occId}`).expect(200);
      expect(occ.body.improvedAnswer).toMatch(/sliding-window/);
      expect(occ.body.originalAnswer).toBe('Token bucket per user in Redis.');
    });

    it('#17 failed tasks retry with backoff and never duplicate records', async () => {
      llm.state.mode = 'fail500';
      const res = await u.post(`/rounds/${roundId}/prepare`, { force: true, mode: 'DEEP' }).expect(201);
      const id = res.body.task.id;
      await runner.run(id, 'w');
      let t = await prisma.agentTask.findUniqueOrThrow({ where: { id } });
      expect(t.state).toBe('retry_wait');
      expect(t.lastError).toMatch(/500/);
      expect(t.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
      llm.state.mode = 'garbage'; // invalid JSON is also retried (with one repair round per attempt)
      await prisma.agentTask.update({ where: { id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
      await app.get(TickService).tick('w');
      t = await prisma.agentTask.findUniqueOrThrow({ where: { id } });
      expect(t.state).toBe('queued');
      await runner.run(id, 'w');
      t = await prisma.agentTask.findUniqueOrThrow({ where: { id } });
      expect(t.state).toBe('retry_wait');
      expect(t.lastError).toMatch(/schema/);
      // exhaust → falls back to manual agent handoff (fallbackToAgent default)
      await prisma.agentTask.update({ where: { id }, data: { state: 'queued', attempts: 2 } });
      await runner.run(id, 'w');
      t = await prisma.agentTask.findUniqueOrThrow({ where: { id } });
      expect(t).toMatchObject({ state: 'ready_for_agent', executionMethod: 'agent_manual' });
      // manual retry once the endpoint is healthy again
      llm.state.mode = 'ok';
      const before = await prisma.preparationModule.count({ where: { courseId: res.body.course.id } });
      await u.post(`/tasks/${id}/retry`, { method: 'llm' }).expect(200);
      await runner.run(id, 'w');
      expect((await prisma.agentTask.findUniqueOrThrow({ where: { id } })).state).toBe('completed');
      const after = await prisma.preparationModule.findMany({ where: { courseId: res.body.course.id } });
      expect(new Set(after.map((l) => l.key)).size).toBe(after.length); // no duplicate lessons
      expect(after.length).toBeLessThanOrEqual(before + COURSE.lessons.length);
      const history = await u.get(`/tasks/${id}`).expect(200);
      expect(history.body.history.length).toBeGreaterThanOrEqual(4);
      // running the same completed task again is skipped (lease)
      expect(await runner.run(id, 'w')).toBe('skipped');
    });
  });

  it('#11 the scheduler creates tasks and recovers them after a restart', async () => {
    // A round 2 days out → short notice: course task due now, no historical milestones.
    const r = await u.post(`/applications/${appId}/rounds`, { type: 'coding', scheduledAt: days(1.5) }).expect(201);
    const tasks = await prisma.agentTask.findMany({ where: { roundId: r.body.id } });
    const courseTask = tasks.find((t) => t.type === 'course_generation')!;
    expect(courseTask.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const reminders = await prisma.reminder.findMany({ where: { roundId: r.body.id } });
    expect(reminders.every((m) => m.dueAt.getTime() >= Date.now() - 5000)).toBe(true);
    // Rescheduling replaces milestones instead of duplicating them.
    await u.patch(`/rounds/${r.body.id}`, { scheduledAt: days(6) }).expect(200);
    const pending = await prisma.reminder.findMany({ where: { roundId: r.body.id, status: 'pending' } });
    expect(new Set(pending.map((p) => p.kind + p.title)).size).toBe(pending.length);
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: courseTask.id } })).state).toMatch(/cancelled|queued|ready_for_agent/);

    // Simulated crash: a task left "running" with an expired lease, plus a due scheduled task.
    const crashed = await prisma.agentTask.create({ data: { workspaceId: (await prisma.application.findUniqueOrThrow({ where: { id: appId } })).workspaceId, type: 'gap_analysis', title: 'crashed', idempotencyKey: `crash-${Date.now()}`, executionMethod: 'llm', inputSnapshot: { roundId }, inputHash: 'x', state: 'running', attempts: 1, leaseOwner: 'dead-worker', leaseExpiresAt: new Date(Date.now() - 60_000), roundId } });
    const due = await prisma.agentTask.findFirstOrThrow({ where: { roundId: r.body.id, state: 'scheduled', type: 'revision_notes' } });
    await prisma.agentTask.update({ where: { id: due.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    // The rescheduled milestone course task is redundant: a course task for this round already exists.
    const redundant = await prisma.agentTask.findFirstOrThrow({ where: { roundId: r.body.id, state: 'scheduled', type: 'course_generation' } });
    await prisma.agentTask.update({ where: { id: redundant.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });

    // "Restart": a brand-new application context runs its first tick.
    const restarted = await boot();
    try {
      const stats = await restarted.get(TickService).tick('new-worker');
      expect(stats.recovered).toBeGreaterThanOrEqual(1);
      expect(stats.activated).toBeGreaterThanOrEqual(1);
      expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: crashed.id } })).state).toBe('retry_wait');
      expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: due.id } })).state).toMatch(/^(queued|ready_for_agent)$/); // routed by live availability
      expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: redundant.id } })).toMatchObject({ state: 'cancelled', routingReason: expect.stringMatching(/Skipped/) });
      // a second tick does not duplicate anything
      const count = await prisma.agentTask.count();
      await restarted.get(TickService).tick('new-worker');
      expect(await prisma.agentTask.count()).toBe(count);
    } finally {
      await restarted.close();
    }
  });

  it('dashboard metrics come from real records; account export excludes secrets', async () => {
    const d = await u.get('/dashboard').expect(200);
    expect(d.body.totals.applications).toBe(await prisma.application.count({ where: { workspace: { memberships: { some: { userId: u.userId } } }, archived: false } }));
    expect(d.body.upcomingInterviews.length).toBeGreaterThan(0);
    expect(d.body.conversion.applied).toBeGreaterThan(0);
    expect(d.body.weakCompetencies.fromInterviews.map((x: { concept: string }) => x.concept)).toContain('sliding window');
    const ex = await u.get('/account/export'); if (ex.status !== 200) console.log('DEBUG', ex.body);
    const s = JSON.stringify(ex.body);
    expect(s).not.toMatch(/passwordHash|apiKeyEncrypted|storagePath/);
    expect(ex.body.applications.length).toBeGreaterThan(0);
  });
});
