// Captures README screenshots from a running stack using the seeded demo account (fictional data).
// Usage: SHOT_EMAIL=demo@icc.test SHOT_PASSWORD=... node apps/web/scripts/screenshots.mjs
// Creates no AI tasks: the preparation course is built with useAi=false.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const email = process.env.SHOT_EMAIL || 'demo@icc.test';
const password = process.env.SHOT_PASSWORD || process.env.SEED_DEMO_PASSWORD;
const out = process.env.SHOT_OUT || join(dirname(fileURLToPath(import.meta.url)), '../../../docs/images');
if (!password) throw new Error('Set SHOT_PASSWORD (the seeded demo password)');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: process.env.SHOT_SCHEME || 'dark' });
const api = context.request;
const login = await api.post(`${base}/api/auth/login`, { data: { email, password } });
if (!login.ok()) throw new Error(`Login failed: ${login.status()}`);
const json = async (r) => { if (!r.ok()) throw new Error(`${r.url()} → ${r.status()}`); return r.json(); };

const apps = await json(await api.get(`${base}/api/applications`));
const app = apps[0];
const detail = await json(await api.get(`${base}/api/applications/${app.id}`));
const past = detail.rounds.find((r) => r.status === 'completed') ?? detail.rounds[0];
const next = detail.rounds.find((r) => r.status !== 'completed') ?? detail.rounds.at(-1);
const { course } = await json(await api.post(`${base}/api/rounds/${next.id}/prepare`, { data: { useAi: false } }));
const full = await json(await api.get(`${base}/api/courses/${course.id}`));
const lesson = full.lessons.find((l) => l.kind === 'system_design') ?? full.lessons[0];

const page = await context.newPage();
const shots = [
  ['dashboard', '/dashboard'],
  ['applications-kanban', '/applications', async () => page.getByRole('tab', { name: 'Kanban' }).click()],
  ['application', `/applications/${app.id}`],
  ['interview-journal', `/rounds/${past.id}`, async () => page.getByRole('button', { name: /salary expectations/i }).click()],
  ['course', `/courses/${course.id}`],
  ['lesson', `/courses/${course.id}/lessons/${lesson.id}`],
  ['question-library', '/questions'],
  ['agent-tasks', '/tasks?f=all'],
  ['ai-settings', '/settings/ai'],
];
for (const [name, path, prep] of shots) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (prep) { await prep().catch(() => undefined); await page.waitForTimeout(500); }
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`✓ ${name}`);
}
await browser.close();
