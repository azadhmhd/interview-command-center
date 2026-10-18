/**
 * The apply engine. Rules it never breaks:
 *  - CAPTCHA, login, OTP or "verify you are human" → stop and report BLOCKED. No bypassing.
 *  - Only answers from the apply kit are typed. Required fields without an answer → NEEDS_ATTENTION, no submit.
 *  - Before clicking Submit it MUST get `submitIntent` approval from the server (recorded first, so a crash or a
 *    retry can never submit twice). In prefill mode the user clicks Submit; the click is recorded the same way.
 *  - A submission is reported only with the confirmation page it saw (text, URL, screenshot).
 */
import type { Page } from 'playwright';

export interface KitAnswer { key: string; label: string; required: boolean; type: string; answer: string; options?: string[]; sensitive?: boolean }
export interface Kit { coverNote?: string; answers: KitAnswer[] }
export interface ApplyJob { id: string; title: string; company: string; applyUrl: string; atsType: string; kit: Kit }
export type Mode = 'auto' | 'prefill';

export interface EngineResult {
  status: 'SUBMITTED' | 'BLOCKED' | 'NEEDS_ATTENTION' | 'FAILED';
  evidence?: { confirmationUrl?: string; confirmationText?: string; screenshotBase64?: string };
  filledFields: { label: string; value?: string; source?: string }[];
  missingFields: string[];
  error?: string;
}

export interface EngineHooks {
  /** server-side duplicate / mode check; must return ok before any submit */
  submitIntent: () => Promise<{ ok: boolean; reason?: string }>;
  heartbeat?: () => Promise<void>;
  log?: (msg: string) => void;
}

export interface EngineOptions {
  mode: Mode;
  resumePath?: string;
  /** how long to wait for the user to submit in prefill mode */
  prefillWaitMs?: number;
  confirmTimeoutMs?: number;
}

const CAPTCHA_FRAMES = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[title*="captcha" i]';
const HUMAN_TEXT = /\b(verify (that )?you are (a )?human|i'?m not a robot|are you a robot|security check|one[- ]time (code|password)|enter the code (we|that was) sent)\b/i;
const LOGIN_URL = /\/(login|signin|sign-in|sso|auth|oauth|session)\b/i;
const CONFIRM_TEXT = /\b(thank(s| you)|application (has been |was )?(received|submitted|sent)|we('ve| have) received|successfully (submitted|applied)|submission (received|complete))\b/i;
const SUBMIT_TEXT = /^(submit( application)?|send application|apply( now)?|submit your application)$/i;

export async function detectBlocker(page: Page): Promise<string | null> {
  for (const f of await page.locator(CAPTCHA_FRAMES).all()) if (await f.isVisible().catch(() => false)) return 'CAPTCHA shown';
  const body = await page.locator('body').innerText().catch(() => '');
  if (HUMAN_TEXT.test(body)) return 'Human verification requested';
  const pw = page.locator('input[type="password"]');
  if ((await pw.count()) && (await pw.first().isVisible().catch(() => false))) return 'Login required';
  if (LOGIN_URL.test(new URL(page.url()).pathname)) return 'Login required';
  return null;
}

async function findForm(page: Page) {
  const has = async () => (await page.locator('form input:not([type=hidden]), form textarea').count()) > 0;
  if (await has()) return true;
  const btn = page.getByRole('link', { name: /^apply( for this job| now)?$/i }).or(page.getByRole('button', { name: /^apply( for this job| now)?$/i })).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  }
  return has();
}

const esc = (s: string) => s.replace(/["\\]/g, '\\$&');

/** Locate the control for a kit answer: label text first, then common name/id patterns used by ATS forms. */
async function control(page: Page, a: KitAnswer) {
  const byLabel = page.getByLabel(a.label, { exact: false });
  if (await byLabel.count()) return byLabel.first();
  const k = esc(a.key);
  const byName = page.locator(`[name="${k}"], [id="${k}"], [name$="[${k}]"], [name="job_application[${k}]"]`);
  if (await byName.count()) return byName.first();
  return null;
}

async function fill(page: Page, a: KitAnswer, resumePath?: string): Promise<'filled' | 'skipped' | 'missing'> {
  const isFile = a.type === 'input_file';
  if (isFile) {
    if (!/resume|cv/i.test(`${a.key} ${a.label}`) || !resumePath) return a.required ? 'missing' : 'skipped';
    const input = (await control(page, a)) ?? page.locator('input[type="file"]').first();
    if (!(await input.count())) return a.required ? 'missing' : 'skipped';
    await input.setInputFiles(resumePath);
    return 'filled';
  }
  if (!a.answer) return a.required ? 'missing' : 'skipped';
  const el = await control(page, a);
  if (!el) {
    // radio groups: pick the option whose accessible name matches the answer
    const radio = page.getByRole('group', { name: new RegExp(esc(a.label).slice(0, 60), 'i') }).getByRole('radio', { name: a.answer, exact: false });
    if (await radio.count()) { await radio.first().check(); return 'filled'; }
    return a.required ? 'missing' : 'skipped';
  }
  const tag = await el.evaluate((n) => n.tagName.toLowerCase());
  const type = (await el.getAttribute('type'))?.toLowerCase();
  if (tag === 'select') await el.selectOption({ label: a.answer }).catch(async () => el.selectOption(a.answer));
  else if (type === 'checkbox') { if (/^(yes|true|i agree|agree)$/i.test(a.answer)) await el.check(); else return a.required ? 'missing' : 'skipped'; }
  else if (type === 'radio') await el.check();
  else await el.fill(a.answer);
  return 'filled';
}

/** Required inputs the page still shows as empty (catches questions the kit didn't know about). */
async function emptyRequired(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('form [required], form [aria-required="true"]'));
    for (const el of els) {
      if ((el as HTMLInputElement).type === 'hidden' || el.closest('[hidden]')) continue;
      const empty = (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio'
        ? !document.querySelector(`[name="${(el as HTMLInputElement).name}"]:checked`)
        : (el as HTMLInputElement).type === 'file' ? !((el as HTMLInputElement).files?.length) : !el.value;
      if (!empty) continue;
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : el.closest('label')?.textContent;
      out.push((label ?? el.getAttribute('aria-label') ?? el.name ?? 'Required field').replace(/\s+/g, ' ').replace(/\*$/, '').trim());
    }
    return [...new Set(out)];
  });
}

interface Baseline { url: string; text: string }

/**
 * Confirmation must be NEW relative to the form page: a confirmation phrase that wasn't on the form (job pages often
 * say "thank you for your interest"), or navigation to a confirmation-looking URL.
 */
async function evidence(page: Page, base: Baseline) {
  const text = await page.locator('body').innerText().catch(() => '');
  const m = [...text.matchAll(new RegExp(CONFIRM_TEXT.source, 'gi'))].find((x) => !base.text.includes(text.slice(Math.max(0, x.index! - 40), x.index! + x[0].length + 40)));
  const moved = page.url() !== base.url;
  const confirmPath = moved && /confirm|thank|success|submitted/i.test(new URL(page.url()).pathname);
  const around = m ? text.slice(Math.max(0, m.index! - 200), m.index! + 400) : text.slice(0, 600);
  const shot = await page.screenshot({ type: 'png' }).catch(() => undefined);
  return { confirmed: !!m || confirmPath, confirmationUrl: page.url(), confirmationText: around.trim().slice(0, 3000), screenshotBase64: shot && shot.length < 3_000_000 ? shot.toString('base64') : undefined };
}

async function waitForConfirmation(page: Page, base: Baseline, timeoutMs: number, hooks: EngineHooks) {
  const until = Date.now() + timeoutMs;
  let lastBeat = Date.now();
  while (Date.now() < until) {
    if (page.isClosed()) return null;
    const e = await evidence(page, base);
    if (e.confirmed) return e;
    if (hooks.heartbeat && Date.now() - lastBeat > 60_000) { await hooks.heartbeat().catch(() => undefined); lastBeat = Date.now(); }
    await page.waitForTimeout(1000).catch(() => undefined);
  }
  return null;
}

export async function applyOnPage(page: Page, job: ApplyJob, hooks: EngineHooks, opts: EngineOptions): Promise<EngineResult> {
  const log = hooks.log ?? (() => undefined);
  const filledFields: EngineResult['filledFields'] = [];
  try {
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    let blocker = await detectBlocker(page);
    if (blocker) return { status: 'BLOCKED', error: blocker, filledFields, missingFields: [] };
    if (!(await findForm(page))) return { status: 'NEEDS_ATTENTION', error: 'No application form found on the page', filledFields, missingFields: [] };
    blocker = await detectBlocker(page);
    if (blocker) return { status: 'BLOCKED', error: blocker, filledFields, missingFields: [] };

    const missing: string[] = [];
    for (const a of job.kit.answers) {
      const r = await fill(page, a, opts.resumePath).catch(() => (a.required ? 'missing' as const : 'skipped' as const));
      if (r === 'filled') filledFields.push({ label: a.label, value: a.type === 'input_file' ? 'CV attached' : a.sensitive ? '(saved decision)' : a.answer.slice(0, 200) });
      if (r === 'missing') missing.push(a.label);
    }
    const stillEmpty = await emptyRequired(page);
    const base: Baseline = { url: page.url(), text: await page.locator('body').innerText().catch(() => '') };
    const missingFields = [...new Set([...missing, ...stillEmpty])];
    log(`filled ${filledFields.length} field(s); ${missingFields.length} required missing`);

    if (opts.mode === 'prefill') {
      // record the user's own Submit click (form submit or submit-button click) before the browser sends it
      let clicked = false;
      await page.exposeFunction('__iccSubmitClicked', async () => { if (!clicked) { clicked = true; await hooks.submitIntent(); } }).catch(() => undefined);
      await page.evaluate(() => {
        const notify = () => (window as unknown as { __iccSubmitClicked: () => void }).__iccSubmitClicked();
        document.addEventListener('submit', notify, true);
        document.addEventListener('click', (e) => { const t = (e.target as HTMLElement)?.closest('button, input[type=submit]'); if (t && ((t as HTMLButtonElement).type === 'submit')) notify(); }, true);
      });
      log('form filled: review it in the browser and click Submit yourself');
      const e = await waitForConfirmation(page, base, opts.prefillWaitMs ?? 20 * 60_000, hooks);
      if (e) return { status: 'SUBMITTED', evidence: e, filledFields, missingFields };
      return { status: 'NEEDS_ATTENTION', error: clicked ? 'Submit was clicked but no confirmation page appeared' : 'Not submitted within the review window', filledFields, missingFields };
    }

    if (missingFields.length) return { status: 'NEEDS_ATTENTION', error: `Required fields without a verified answer: ${missingFields.slice(0, 6).join(', ')}`, filledFields, missingFields };
    const submit = page.locator('form button[type="submit"], form input[type="submit"]').or(page.getByRole('button', { name: SUBMIT_TEXT })).first();
    if (!(await submit.count())) return { status: 'NEEDS_ATTENTION', error: 'Submit button not found', filledFields, missingFields };
    const intent = await hooks.submitIntent();
    if (!intent.ok) return { status: 'NEEDS_ATTENTION', error: `Not submitted: ${intent.reason}`, filledFields, missingFields };
    await submit.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const e = await waitForConfirmation(page, base, opts.confirmTimeoutMs ?? 20_000, hooks);
    if (e) return { status: 'SUBMITTED', evidence: e, filledFields, missingFields };
    blocker = await detectBlocker(page);
    const after = await evidence(page, base);
    return { status: blocker ? 'BLOCKED' : 'NEEDS_ATTENTION', error: blocker ?? 'Clicked Submit but no confirmation page was detected', evidence: after, filledFields, missingFields };
  } catch (e) {
    return { status: 'FAILED', error: (e as Error).message.slice(0, 500), filledFields, missingFields: [] };
  }
}
