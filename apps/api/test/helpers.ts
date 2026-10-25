import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'node:http';
import request from 'supertest';
import { createApp } from '../src/main';

export async function boot() {
  const app = await createApp(false);
  await app.init();
  return app;
}

let n = 0;
export async function register(app: INestApplication, name = 'User') {
  const email = `${name.toLowerCase()}-${Date.now()}-${n++}@example.test`;
  const res = await request(app.getHttpServer()).post('/api/auth/register').send({ email, name, password: 'correct-horse-battery' }).expect(201);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const api = () => request(app.getHttpServer());
  return {
    email, token: res.body.token as string, userId: res.body.id as string,
    get: (url: string) => api().get(`/api${url}`).set(auth),
    post: (url: string, body: object = {}) => api().post(`/api${url}`).set(auth).send(body),
    patch: (url: string, body: object = {}) => api().patch(`/api${url}`).set(auth).send(body),
    put: (url: string, body: object = {}) => api().put(`/api${url}`).set(auth).send(body),
    del: (url: string, body: object = {}) => api().delete(`/api${url}`).set(auth).send(body),
    raw: api, auth,
  };
}
export type Client = Awaited<ReturnType<typeof register>>;

const body = (req: IncomingMessage) => new Promise<string>((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });

/** Minimal OpenAI-compatible server. `mode` lets tests simulate outages and bad output. */
export async function fakeLlm() {
  const state = { mode: 'ok' as 'ok' | 'fail500' | 'garbage', calls: 0, lastModel: '' };
  const server: Server = createServer(async (req, res) => {
    const send = (code: number, obj: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer test-key') return send(401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } });
    if (req.method === 'GET' && req.url === '/v1/models') return send(200, { object: 'list', data: [{ id: 'fake-model', object: 'model' }] });
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return send(404, { error: { message: 'not found' } });
    const payload = JSON.parse(await body(req));
    state.calls++;
    state.lastModel = payload.model;
    if (payload.model !== 'fake-model' && payload.model !== 'fake-eval') return send(404, { error: { message: `model ${payload.model} not found` } });
    const user = String(payload.messages.at(-1).content);
    const reply = (content: string) => send(200, { id: 'x', object: 'chat.completion', model: payload.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } });
    if (user.includes('single word OK')) return reply('OK');
    if (user.includes('{"ok":true}')) return reply('{"ok":true}');
    if (state.mode === 'fail500') return send(500, { error: { message: 'upstream exploded' } });
    if (state.mode === 'garbage') return reply('I cannot produce JSON today.');
    if (user.includes('crash course')) return reply('```json\n' + JSON.stringify(COURSE) + '\n```');
    if (user.includes('Evaluate the candidate')) return reply(JSON.stringify(EVALUATION));
    if (user.includes('improved, interview-ready answer')) return reply(JSON.stringify({ improvedAnswer: 'Use a sliding-window log or counter in Redis with Lua for atomicity...', conceptsCorrect: ['token bucket'], conceptsPartial: [], conceptsMissed: ['sliding window'], mistakes: 'Did not discuss distributed counters', communicationNotes: 'Lead with requirements' }));
    if (user.includes('Extract structured information from the CV')) return reply(JSON.stringify({ name: 'Test Person', skills: ['Python', 'PostgreSQL'], roles: [{ company: 'Acme', title: 'Engineer', highlights: [] }] }));
    if (user.includes('Convert the CV text into the resume builder structure')) return reply(JSON.stringify(IMPORTED_RESUME));
    if (user.includes('Tailor this copy of the candidate')) {
      // reverse the first entry's bullets and first skill group; try to invent a metric in the second entry (must be rejected)
      const ctx = JSON.parse(user.slice(user.indexOf('<context>') + 9, user.indexOf('</context>')));
      const entries = ctx.resume.sections.flatMap((x: { entries: { id: string; bullets: string[] }[] }) => x.entries).filter((e: { bullets: string[] }) => e.bullets.length);
      const group = ctx.resume.sections.flatMap((x: { groups: { id: string; items: string[] }[] }) => x.groups)[0];
      return reply(JSON.stringify({
        entries: [{ id: entries[0].id, bullets: [...entries[0].bullets].reverse() }, ...(entries[1] ? [{ id: entries[1].id, bullets: ['Grew revenue by 999%'] }] : [])],
        skillGroups: group ? [{ id: group.id, items: [...group.items].reverse() }] : [], notes: `Tailored for ${ctx.job.company}`,
      }));
    }
    if (user.includes('mock interview questions')) return reply(JSON.stringify({ questions: [{ prompt: 'How would you shard a chat service?', modelAnswer: 'By conversation id...', followUps: [] }] }));
    return reply(JSON.stringify({}));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { state, url: `http://127.0.0.1:${port}/v1`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export const COURSE = {
  expectations: 'A 45-minute system design interview focused on distributed systems.',
  competencies: ['Requirements', 'Scaling', 'Consistency'],
  topicChecklist: [{ title: 'Rate limiting', priority: 'high', reason: 'Missed previously' }],
  lessons: [
    { key: 'sd-framework', kind: 'system_design', title: 'Framework (AI-tailored)', objectives: ['Run the interview'], estimatedMinutes: 40, explanation: 'Tailored explanation of the framework for a senior backend engineer.', questions: [{ prompt: 'Design a rate limiter', modelAnswer: 'Sliding window in Redis...', followUps: ['How do you handle multiple regions?'], source: 'AI_PREDICTED' }], evaluationCriteria: ['Clarifies requirements'], commonMistakes: ['Jumping to boxes'] },
    { key: 'flashcards', kind: 'flashcards', title: 'Flashcards', objectives: ['Recall'], estimatedMinutes: 15, explanation: 'Active recall cards for the key concepts in this course.', questions: [{ prompt: 'What is consistent hashing?', modelAnswer: 'A ring...', followUps: [], source: 'PRACTICE' }], evaluationCriteria: [], commonMistakes: [] },
  ],
  questionsToAsk: ['What scale do you run at?'],
  risks: ['Kafka partitioning still weak'],
  finalNotes: 'Remember: requirements first.',
  assumptions: ['Assumed a typical 45 minute format'],
};

export const EVALUATION = {
  score: 6.5, rubric: { correctness: 7, completeness: 6, depth: 6, clarity: 7 }, missingConcepts: ['sliding window'], incorrectClaims: [],
  improvements: ['Discuss distributed counters'], strongAnswer: 'A strong answer would...', followUps: ['Multi-region?'], confidence: 'medium',
};

export const IMPORTED_RESUME = {
  header: { fullName: 'Sam Rivera', headline: 'Backend Engineer', email: 'sam@example.test', phone: '+971 50 000 0000', location: 'Dubai', links: [{ label: 'samrivera', url: 'linkedin.com/in/samrivera' }] },
  sections: [
    { kind: 'summary', title: '', text: 'Backend engineer with 7 years of Python.' },
    { kind: 'skills', title: 'Skills', groups: [{ label: 'Backend & Languages', items: ['Python', 'Django', 'FastAPI'] }] },
    { kind: 'experience', title: 'Work Experience', entries: [{ title: 'Senior Engineer', subtitle: 'Acme', start: '2021', end: 'Present', location: 'Dubai, UAE', bullets: ['Built the payments API serving 2M users'] }] },
  ],
};
