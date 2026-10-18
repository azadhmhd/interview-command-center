import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProfile } from '../src/browser';
import { applyOnPage, ApplyJob, EngineHooks } from '../src/engine';

/** Mock ATS pages. Records every form POST so tests can prove nothing was submitted without approval. */
let server: Server;
let base = '';
const posts: { path: string; at: number; bytes: number }[] = [];
const FORM = (extra = '') => `<!doctype html><html><body>
  <h1>Senior Backend Engineer</h1><p>Thank you for your interest in Acme. We use Python.</p>
  <form method="post" action="/submit" enctype="multipart/form-data">
    <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
    <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
    <label for="email">Email *</label><input id="email" name="email" type="email" required>
    <label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required>
    <label for="question_1">What are your salary expectations? *</label><input id="question_1" name="question_1" required>
    <label><input type="checkbox" name="privacy" required> I consent to the privacy policy</label>
    ${extra}
    <button type="submit">Submit application</button>
  </form></body></html>`;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const html = (b: string) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(b); };
    if (req.method === 'POST') {
      let bytes = 0;
      req.on('data', (d) => (bytes += d.length));
      req.on('end', () => { posts.push({ path: req.url!, at: Date.now(), bytes }); res.writeHead(303, { location: '/confirmation' }); res.end(); });
      return;
    }
    if (req.url === '/form') return html(FORM());
    if (req.url === '/extra') return html(FORM('<label for="dl">Do you have a driving license? *</label><input id="dl" name="dl" required>'));
    if (req.url === '/captcha') return html(FORM('<iframe src="/recaptcha/api2/anchor" title="reCAPTCHA" width="300" height="80"></iframe>'));
    if (req.url === '/login') return html('<form><label>Email<input name="e"></label><label>Password<input type="password" name="p"></label></form>');
    if (req.url === '/confirmation') return html('<h1>Thank you for applying!</h1><p>Your application has been received.</p>');
    html('<p>stub</p>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));
test.beforeEach(() => { posts.length = 0; });

const cv = (() => { const d = mkdtempSync(join(tmpdir(), 'cv-')); const p = join(d, 'cv.pdf'); writeFileSync(p, '%PDF-1.4 test cv'); return p; })();
const job = (path: string): ApplyJob => ({
  id: 'lead1', title: 'Senior Backend Engineer', company: 'Acme', applyUrl: base + path, atsType: 'greenhouse',
  kit: { answers: [
    { key: 'first_name', label: 'First Name', required: true, type: 'input_text', answer: 'Sam' },
    { key: 'last_name', label: 'Last Name', required: true, type: 'input_text', answer: 'Rivera' },
    { key: 'email', label: 'Email', required: true, type: 'input_text', answer: 'sam@example.test' },
    { key: 'resume', label: 'Resume/CV', required: true, type: 'input_file', answer: 'Attach CV' },
    { key: 'question_1', label: 'What are your salary expectations?', required: true, type: 'input_text', answer: 'AED 20,000 per month' },
    { key: 'privacy', label: 'I consent to the privacy policy', required: true, type: 'checkbox', answer: 'Yes', sensitive: true },
  ] },
});
const hooks = (ok = true) => {
  const calls: number[] = [];
  const h: EngineHooks = { submitIntent: async () => { calls.push(Date.now()); return ok ? { ok: true } : { ok: false, reason: 'Already submitted for this job' }; } };
  return { h, calls };
};

test('auto mode: records the submit intent BEFORE submitting, then captures the confirmation as evidence', async ({ page }) => {
  const { h, calls } = hooks();
  const r = await applyOnPage(page, job('/form'), h, { mode: 'auto', resumePath: cv });
  expect(r.status).toBe('SUBMITTED');
  expect(calls).toHaveLength(1);
  expect(posts).toHaveLength(1);
  expect(calls[0]).toBeLessThanOrEqual(posts[0].at);
  expect(posts[0].bytes).toBeGreaterThan(200); // multipart body includes the CV
  expect(r.evidence?.confirmationText).toMatch(/Thank you for applying/);
  expect(r.evidence?.confirmationUrl).toBe(`${base}/confirmation`);
  expect(r.evidence?.screenshotBase64?.length).toBeGreaterThan(1000);
  expect(r.filledFields.map((f) => f.label)).toEqual(expect.arrayContaining(['First Name', 'Resume/CV', 'I consent to the privacy policy']));
  expect(r.filledFields.find((f) => f.label.startsWith('I consent'))?.value).toBe('(saved decision)');
});

test('never submits when the server refuses the intent (duplicate / auto-submit turned off)', async ({ page }) => {
  const r = await applyOnPage(page, job('/form'), hooks(false).h, { mode: 'auto', resumePath: cv });
  expect(r).toMatchObject({ status: 'NEEDS_ATTENTION' });
  expect(r.error).toMatch(/Already submitted/);
  expect(posts).toHaveLength(0);
});

test('stops at a CAPTCHA or login wall without submitting', async ({ page }) => {
  expect(await applyOnPage(page, job('/captcha'), hooks().h, { mode: 'auto', resumePath: cv })).toMatchObject({ status: 'BLOCKED', error: 'CAPTCHA shown' });
  expect(await applyOnPage(page, job('/login'), hooks().h, { mode: 'auto', resumePath: cv })).toMatchObject({ status: 'BLOCKED', error: 'Login required' });
  expect(posts).toHaveLength(0);
});

test('never guesses: an unexpected required question stops the auto-submit', async ({ page }) => {
  const r = await applyOnPage(page, job('/extra'), hooks().h, { mode: 'auto', resumePath: cv });
  expect(r.status).toBe('NEEDS_ATTENTION');
  expect(r.missingFields).toContain('Do you have a driving license?');
  expect(posts).toHaveLength(0);
});

test('a missing CV blocks submission', async ({ page }) => {
  const r = await applyOnPage(page, job('/form'), hooks().h, { mode: 'auto' });
  expect(r.status).toBe('NEEDS_ATTENTION');
  expect(r.missingFields).toContain('Resume/CV');
  expect(posts).toHaveLength(0);
});

test('prefill mode: fills and waits; "Thank you for your interest" on the job page is not mistaken for success', async ({ page }) => {
  const r = await applyOnPage(page, job('/form'), hooks().h, { mode: 'prefill', resumePath: cv, prefillWaitMs: 1500 });
  expect(r).toMatchObject({ status: 'NEEDS_ATTENTION', error: 'Not submitted within the review window' });
  expect(posts).toHaveLength(0);
});

test('prefill mode: the user clicks Submit, the click is recorded first, the confirmation is captured', async ({ page }) => {
  const { h, calls } = hooks();
  const run = applyOnPage(page, job('/form'), h, { mode: 'prefill', resumePath: cv, prefillWaitMs: 15_000 });
  await expect(page.locator('#question_1')).toHaveValue('AED 20,000 per month');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Submit application' }).click(); // the human
  const r = await run;
  expect(r.status).toBe('SUBMITTED');
  expect(calls).toHaveLength(1);
  expect(posts).toHaveLength(1);
});

test('browser profiles are isolated, persistent and locked against concurrent use', async () => {
  const root = mkdtempSync(join(tmpdir(), 'profiles-'));
  const a = await openProfile('alice', { headless: true, root });
  // persistent cookies (with an expiry) survive restarts; session-only cookies are discarded by design
  await a.context.addCookies([{ name: 'session', value: 'a-secret', url: base, expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await expect(openProfile('alice', { headless: true, root })).rejects.toThrow(/in use/);
  const b = await openProfile('bob', { headless: true, root });
  expect(await b.context.cookies(base)).toEqual([]);
  await b.close();
  await a.close();
  const again = await openProfile('alice', { headless: true, root });
  expect((await again.context.cookies(base)).map((c) => c.name)).toContain('session');
  await again.close();
  expect(existsSync(join(root, 'alice', '.icc-runner.lock'))).toBe(false);
  await expect(openProfile('../etc', { headless: true, root })).rejects.toThrow(/Profile name/);
});
