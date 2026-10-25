/**
 * The apply engine. Rules it never breaks:
 *  - CAPTCHA, login, OTP or "verify you are human" → stop and report BLOCKED. No bypassing.
 *  - Only answers from the apply kit are typed. Required fields without an answer → NEEDS_ATTENTION, no submit.
 *  - Before clicking Submit it MUST get `submitIntent` approval from the server (recorded first, so a crash or a
 *    retry can never submit twice). In prefill mode the user clicks Submit; the click is recorded the same way.
 *  - A submission is reported only with the confirmation page it saw (text, URL, screenshot).
 *  - Headless, it never clicks Submit on a page that scores visitors with invisible bot detection: those submissions
 *    are silently rejected, so it reports BLOCKED and leaves the job to a visible browser or to you.
 */
import { basename } from 'node:path';
import type { Locator, Page } from 'playwright';

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
  /** claude engine: whether Submit was clicked (the intent is recorded before Claude starts) */
  submitClicked?: boolean;
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
  /** the browser runs headless (server runner): see BOT_SCORING */
  headless?: boolean;
}

const CAPTCHA_FRAMES = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[title*="captcha" i]';
const HUMAN_TEXT = /\b(verify (that )?you are (a )?human|i'?m not a robot|are you a robot|security check|one[- ]time (code|password)|enter the code (we|that was) sent)\b/i;
const LOGIN_URL = /\/(login|signin|sign-in|sso|auth|oauth|session)\b/i;
const CONFIRM_TEXT = /\b(thank(s| you)|application (has been |was )?(received|submitted|sent)|we('ve| have) received|successfully (submitted|applied)|submission (received|complete))\b/i;
const SUBMIT_TEXT = /^(submit( application)?|send application|apply( now)?|submit your application)$/i;
/** invisible risk scoring (reCAPTCHA v3/Enterprise, hCaptcha, Turnstile): rejects headless browsers without showing anything */
const BOT_SCORING = /recaptcha\/(enterprise|api)\.js|hcaptcha\.com\/1\/api\.js|challenges\.cloudflare\.com\/turnstile/i;
const FIRST_NAME = /^(first|given) name\b/i;
const LAST_NAME = /^(last name|surname|family name)\b/i;

export async function detectBlocker(page: Page): Promise<string | null> {
  for (const f of await page.locator(CAPTCHA_FRAMES).all()) if (await f.isVisible().catch(() => false)) return 'CAPTCHA shown';
  const body = await page.locator('body').innerText().catch(() => '');
  if (HUMAN_TEXT.test(body)) return 'Human verification requested';
  const pw = page.locator('input[type="password"]');
  if ((await pw.count()) && (await pw.first().isVisible().catch(() => false))) return 'Login required';
  if (LOGIN_URL.test(new URL(page.url()).pathname)) return 'Login required';
  return null;
}

/** Visible application fields. Not scoped to <form>: Ashby and other React ATS pages render inputs without one. */
const FIELDS = 'input:not([type=hidden]):not([type=file]):not([type=search]), textarea:not([name="g-recaptcha-response"])';

async function findForm(page: Page) {
  // client-rendered forms appear a few seconds after the HTML loads
  const has = async (ms: number) => !!(await page.locator(FIELDS).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false));
  if (await has(15_000)) return true;
  const btn = page.getByRole('link', { name: /^apply( for this job| now)?$/i }).or(page.getByRole('button', { name: /^apply( for this job| now)?$/i })).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForLoadState('domcontentloaded');
  }
  return has(10_000);
}

const esc = (s: string) => s.replace(/["\\]/g, '\\$&');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locate the control for a kit answer. The ATS field key (name/id) is the most precise, then the exact label (a
 * trailing "*" allowed), then a loose label match only when it is unambiguous: "First Name" must never land in
 * "Preferred First Name".
 */
async function control(page: Page, a: KitAnswer) {
  const k = esc(a.key);
  const byKey = page.locator(`[name="${k}"], [id="${k}"], [name$="[${k}]"], [name="job_application[${k}]"]`);
  if (await byKey.count()) return byKey.first();
  const exact = page.getByLabel(new RegExp(`^\\s*${reEsc(a.label.trim())}\\s*\\*?\\s*$`, 'i'));
  if (await exact.count()) return exact.first();
  const loose = page.getByLabel(a.label, { exact: false });
  if ((await loose.count()) === 1) return loose;
  return null;
}

/** The control's own label text (label[for], wrapping label or aria-label). */
const labelOf = (el: Locator) => el.evaluate((n) => ((n.id && document.querySelector(`label[for="${CSS.escape(n.id)}"]`)?.textContent) || n.closest('label')?.textContent || n.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim());

const isFullName = (a: KitAnswer) => /^_?(systemfield_)?(full_?)?name$/i.test(a.key) || /^(full )?name$/i.test(a.label.trim());
const nameParts = (full: string) => { const p = full.trim().split(/\s+/); return { first: p[0] ?? '', last: p.slice(1).join(' ') }; };

/** Searchable dropdowns (react-select and similar): type the answer and pick the option with that exact name. */
async function choose(page: Page, el: Locator, answer: string) {
  await el.click();
  await el.fill(answer);
  const exact = page.getByRole('option', { name: answer, exact: true });
  const loose = page.getByRole('option', { name: answer });
  const opt = (await exact.count()) ? exact.first() : loose;
  await opt.first().waitFor({ state: 'visible', timeout: 5000 });
  if (!(await exact.count()) && (await loose.count()) !== 1) throw new Error(`No single option "${answer}"`); // never guess
  await opt.first().click();
}

async function fill(page: Page, a: KitAnswer, resumePath?: string): Promise<'filled' | 'skipped' | 'missing'> {
  const isFile = a.type === 'input_file';
  if (isFile) {
    if (!/resume|cv/i.test(`${a.key} ${a.label}`) || !resumePath) return a.required ? 'missing' : 'skipped';
    const input = (await control(page, a)) ?? page.locator('input[type="file"]').first();
    if (!(await input.count())) return a.required ? 'missing' : 'skipped';
    await input.setInputFiles(resumePath);
    // custom uploaders (Greenhouse, Ashby) hide the input and upload in their own script, which can fail (seen live:
    // an early attach got a 401): trust the CV only once the page shows its file name
    if (!(await input.isVisible())) {
      const shown = await page.getByText(basename(resumePath)).first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
      if (!shown) return a.required ? 'missing' : 'skipped';
    }
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
  if ((await el.getAttribute('role')) === 'combobox') { await choose(page, el, a.answer); return 'filled'; }
  // a full-name answer in a field the page labels "First Name": only the first name goes there (the rest: fillLastName)
  if (isFullName(a) && FIRST_NAME.test(await labelOf(el))) { await el.fill(nameParts(a.answer).first); return 'filled'; }
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
    const els = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[required], textarea[required], select[required], [aria-required="true"]'));
    for (const el of els) {
      if ((el as HTMLInputElement).type === 'hidden' || el.closest('[hidden]')) continue;
      // a searchable dropdown's text box empties after a pick; its hidden companion input carries the value
      if (el.getAttribute('role') === 'combobox') continue;
      // invisible controls don't count, except file inputs (ATS pages hide them behind an "Upload" button)
      if ((el as HTMLInputElement).type !== 'file' && !(el as HTMLElement).offsetParent) continue;
      const named = el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')!.split(' ')[0])?.textContent;
      // a required container (Greenhouse's upload group, radio groups): filled when anything inside it is
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        const inside = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea, select'));
        if (inside.some((i) => (i.type === 'file' ? !!i.files?.length : i.type === 'checkbox' || i.type === 'radio' ? i.checked : !!i.value))) continue;
        // uploaders clear their input after uploading and show the file name instead
        if (/\S\.(pdf|docx?|rtf|txt|odt)\b/i.test((el as HTMLElement).innerText)) continue;
        out.push((named || el.getAttribute('aria-label') || 'Required field').replace(/\s+/g, ' ').replace(/\*$/, '').trim());
        continue;
      }
      const empty = (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio'
        ? !document.querySelector(`[name="${(el as HTMLInputElement).name}"]:checked`)
        : (el as HTMLInputElement).type === 'file' ? !((el as HTMLInputElement).files?.length) : !el.value;
      if (!empty) continue;
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : el.closest('label')?.textContent;
      out.push((label || named || el.getAttribute('aria-label') || el.name || 'Required field').replace(/\s+/g, ' ').replace(/\*$/, '').trim());
    }
    return [...new Set(out)];
  });
}

/** Forms that split the name the kit has in one piece: the rest of it goes into an empty "Last Name" field. */
async function fillLastName(page: Page, kit: Kit): Promise<{ label: string; value: string } | null> {
  const full = kit.answers.find((a) => isFullName(a) && a.answer.trim().includes(' '));
  if (!full || kit.answers.some((a) => LAST_NAME.test(a.label))) return null;
  for (const el of await page.locator(FIELDS).all()) {
    const label = await labelOf(el);
    if (!LAST_NAME.test(label) || (await el.inputValue().catch(() => 'x')) || !(await el.isVisible())) continue;
    await el.fill(nameParts(full.answer).last);
    return { label: label.replace(/\*$/, '').trim(), value: nameParts(full.answer).last };
  }
  return null;
}

/** Validation or error messages the page shows (after a Submit that did not confirm). */
async function pageErrors(page: Page): Promise<string[]> {
  const texts = await page.locator('[role="alert"], [aria-live="assertive"], [aria-invalid="true"] ~ *, [class*="error" i]').allInnerTexts().catch(() => [] as string[]);
  return [...new Set(texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 2 && t.length < 300))].slice(0, 5);
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
  const shot = await page.screenshot({ type: 'png', fullPage: true }).catch(() => undefined);
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
    // let the page finish its own setup requests first (uploaders fetch their upload permissions after the form renders)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const missing: string[] = [];
    for (const a of job.kit.answers) {
      const r = await fill(page, a, opts.resumePath).catch(() => (a.required ? 'missing' as const : 'skipped' as const));
      if (r === 'filled') filledFields.push({ label: a.label, value: a.type === 'input_file' ? 'CV attached' : a.sensitive ? '(saved decision)' : a.answer.slice(0, 200) });
      if (r === 'missing') missing.push(a.label);
    }
    const last = await fillLastName(page, job.kit).catch(() => null);
    if (last) filledFields.push(last);
    const stillEmpty = await emptyRequired(page);
    const base: Baseline = { url: page.url(), text: await page.locator('body').innerText().catch(() => '') };
    const missingFields = [...new Set([...missing, ...stillEmpty])];
    log(`filled ${filledFields.length} field(s); ${missingFields.length} required missing`);

    if (opts.mode === 'prefill') {
      // record the user's own Submit click (form submit or submit-button click) before the browser sends it
      let clicked = false;
      await page.exposeFunction('__iccSubmitClicked', async () => { if (!clicked) { clicked = true; await hooks.submitIntent(); } }).catch(() => undefined);
      // plain source text: tsx/esbuild would wrap a named function with a __name() helper that doesn't exist in the page
      await page.evaluate(`(() => {
        const notify = () => window.__iccSubmitClicked();
        document.addEventListener('submit', notify, true);
        document.addEventListener('click', (e) => { const t = e.target && e.target.closest('button, input[type=submit]'); if (t && t.type === 'submit') notify(); }, true);
      })()`);
      log('form filled: review it in the browser and click Submit yourself');
      const e = await waitForConfirmation(page, base, opts.prefillWaitMs ?? 20 * 60_000, hooks);
      if (e) return { status: 'SUBMITTED', evidence: e, filledFields, missingFields };
      // screenshot of the filled form, so you can see what was entered
      const { confirmed: _, ...shot } = await evidence(page, base);
      return { status: 'NEEDS_ATTENTION', error: clicked ? 'Submit was clicked but no confirmation page appeared' : 'Not submitted within the review window', evidence: shot, filledFields, missingFields };
    }

    if (missingFields.length) return { status: 'NEEDS_ATTENTION', error: `Required fields without a verified answer: ${missingFields.slice(0, 6).join(', ')}`, filledFields, missingFields };
    const submit = page.locator('form button[type="submit"], form input[type="submit"]').or(page.getByRole('button', { name: SUBMIT_TEXT })).first();
    if (!(await submit.count())) return { status: 'NEEDS_ATTENTION', error: 'Submit button not found', filledFields, missingFields };
    if (opts.headless) {
      const scoring = await page.evaluate(`Array.from(document.scripts).map((s) => s.src).join(' ')`).then((src) => BOT_SCORING.test(String(src)));
      if (scoring) {
        const { confirmed: _, ...shot } = await evidence(page, base);
        return { status: 'BLOCKED', error: 'Invisible bot check on this form (reCAPTCHA/hCaptcha/Turnstile) rejects headless browsers: run the apply runner with a visible browser, or apply yourself', evidence: shot, filledFields, missingFields };
      }
    }
    const intent = await hooks.submitIntent();
    if (!intent.ok) return { status: 'NEEDS_ATTENTION', error: `Not submitted: ${intent.reason}`, filledFields, missingFields };
    await submit.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const e = await waitForConfirmation(page, base, opts.confirmTimeoutMs ?? 20_000, hooks);
    if (e) return { status: 'SUBMITTED', evidence: e, filledFields, missingFields };
    blocker = await detectBlocker(page);
    const after = await evidence(page, base);
    const errors = await pageErrors(page);
    return { status: blocker ? 'BLOCKED' : 'NEEDS_ATTENTION', error: blocker ?? `Clicked Submit but no confirmation page was detected${errors.length ? `; the page says: ${errors.join(' | ')}` : ''}`, evidence: after, filledFields, missingFields };
  } catch (e) {
    return { status: 'FAILED', error: (e as Error).message.slice(0, 500), filledFields, missingFields: [] };
  }
}
