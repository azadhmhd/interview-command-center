/**
 * Interview Command Center apply runner (runs on your machine, next to a real browser).
 *
 *   ICC_API_URL=http://localhost:3000 ICC_RUNNER_TOKEN=<token> pnpm apply:runner
 *
 * Env: APPLY_RUNNER_ENGINE=claude (Claude Code + Claude in Chrome in your own Brave/Chrome) or playwright (default),
 *      APPLY_RUNNER_BROWSER_ID (claude engine: the Claude in Chrome deviceId to use when several browsers are connected),
 *      APPLY_RUNNER_PROFILE (default "jobs"), APPLY_RUNNER_HEADLESS=true|false (default false = visible),
 *      APPLY_RUNNER_ONCE=true (one job then exit), APPLY_RUNNER_POLL_MS (default 60000),
 *      APPLY_RUNNER_REVIEW_MINUTES (fill-only mode: how long to wait for your Submit click, default 20).
 * The mode (auto-submit vs. fill-only) comes from your Auto Apply settings, checked again by the server before Submit.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { IccApi } from './api';
import { openProfile } from './browser';
import { applyWithClaude } from './claude';
import { applyOnPage, type EngineResult } from './engine';

const env = process.env;
const api = new IccApi(env.ICC_API_URL ?? 'http://localhost:3000', env.ICC_RUNNER_TOKEN ?? '');
const useClaude = env.APPLY_RUNNER_ENGINE === 'claude';
const runnerId = `${hostname()}:${process.pid}${useClaude ? ':claude' : ''}`;
const log = (m: string) => console.log(`[apply-runner ${new Date().toISOString()}] ${m}`);
let stopping = false;
const stop = () => { stopping = true; log('stopping after the current job…'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop); // docker stop

async function once(): Promise<boolean> {
  const claim = await api.claim(runnerId, useClaude ? 'claude' : 'playwright');
  if (!claim.attempt || !claim.lead) { log(claim.reason ?? 'nothing to do'); return false; }
  const { attempt, lead, mode } = claim;
  log(`attempt ${attempt.attemptNo} · ${lead.title} at ${lead.company} · ${mode === 'auto' ? 'AUTO-SUBMIT' : 'fill only, you submit'}`);
  const tmp = mkdtempSync(join(tmpdir(), 'icc-apply-'));
  const beat = setInterval(() => api.heartbeat(attempt.id).catch(() => undefined), 60_000);
  const profile = useClaude ? null : await openProfile(env.APPLY_RUNNER_PROFILE ?? 'jobs', { headless: env.APPLY_RUNNER_HEADLESS === 'true' });
  try {
    let resumePath: string | undefined;
    if (lead.resume) {
      // Claude uploads it as-is, so employers see your own file name
      const name = useClaude ? basename(lead.resume.fileName).replace(/[^\w.\- ]/g, '_') : `cv${extname(lead.resume.fileName) || '.pdf'}`;
      resumePath = join(tmp, name || 'cv.pdf');
      writeFileSync(resumePath, await api.downloadResume(lead.resume.id), { mode: 0o600 });
    }
    if (!profile) {
      // Claude may click Submit at any point of its run, so the intent is recorded before it starts (never twice)
      let result: EngineResult;
      const intent = mode === 'auto' ? await api.submitIntent(attempt.id) : { ok: true };
      if (!intent.ok) result = { status: 'NEEDS_ATTENTION', error: `Not submitted: ${intent.reason}`, filledFields: [], missingFields: [] };
      else result = await applyWithClaude(lead, mode ?? 'prefill', resumePath, { log, browserId: env.APPLY_RUNNER_BROWSER_ID });
      const r = await api.result(attempt.id, result);
      log(`→ ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
      return true;
    }
    const page = profile.context.pages()[0] ?? (await profile.context.newPage());
    const result = await applyOnPage(page, lead, { submitIntent: () => api.submitIntent(attempt.id), heartbeat: () => api.heartbeat(attempt.id).then(() => undefined), log }, { mode: mode ?? 'prefill', resumePath, prefillWaitMs: Number(env.APPLY_RUNNER_REVIEW_MINUTES ?? 20) * 60_000, headless: env.APPLY_RUNNER_HEADLESS === 'true' });
    const r = await api.result(attempt.id, result);
    log(`→ ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
  } catch (e) {
    log(`error: ${(e as Error).message}`);
    await api.result(attempt.id, { status: 'FAILED', error: (e as Error).message, filledFields: [], missingFields: [] }).catch(() => undefined);
  } finally {
    clearInterval(beat);
    await profile?.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  return true;
}

/**
 * Claude engine: a job_application task waiting for an agent ("Apply with Claude Code") is run here, like a claimed job.
 * The task page keeps the manual steps; this only means nobody has to do them.
 */
async function agentTask(): Promise<boolean> {
  const t = (await api.agentTasks())[0];
  if (!t) return false;
  const [full, pkg] = await Promise.all([api.task(t.id), api.taskPackage(t.id)]);
  const leadId = full.inputSnapshot?.leadId;
  const ctx = pkg.context;
  await api.takeTask(t.id);
  log(`agent task · ${t.title}`);
  let out: EngineResult;
  const tmp = mkdtempSync(join(tmpdir(), 'icc-task-'));
  try {
    if (ctx.duplicateCheck !== 'none') out = { status: 'NEEDS_ATTENTION', error: `Duplicate check: ${ctx.duplicateCheck}`, filledFields: [], missingFields: [], submitClicked: false };
    else if (!ctx.kit) out = { status: 'NEEDS_ATTENTION', error: 'This job has no apply kit yet', filledFields: [], missingFields: [], submitClicked: false };
    else {
      const lead = leadId ? await api.lead(leadId) : null;
      const rid = lead?.resume?.id ?? lead?.resumeId ?? undefined;
      let resumePath: string | undefined;
      if (rid) {
        resumePath = join(tmp, basename(lead?.resume?.fileName ?? 'cv.pdf').replace(/[^\w.\- ]/g, '_'));
        writeFileSync(resumePath, await api.downloadResume(rid), { mode: 0o600 });
      }
      out = await applyWithClaude({ id: leadId ?? t.id, ...ctx.job, kit: ctx.kit }, ctx.autoSubmit ? 'auto' : 'prefill', resumePath, { log, browserId: env.APPLY_RUNNER_BROWSER_ID });
    }
  } catch (e) {
    out = { status: 'FAILED', error: (e as Error).message, filledFields: [], missingFields: [] };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const notes = [out.error, out.submitClicked === false ? 'Submit was not clicked.' : ''].filter(Boolean).join(' ');
  await api.importTask(t.id, { status: out.status, confirmationUrl: out.evidence?.confirmationUrl, confirmationText: out.evidence?.confirmationText, filledFields: out.filledFields, missingFields: out.missingFields, notes: notes || undefined })
    .then(() => log(`→ ${out.status}`)).catch((e) => log(`import failed (task stays "submitted" for you to finish): ${(e as Error).message}`));
  return true;
}

async function main() {
  if (!env.ICC_RUNNER_TOKEN) throw new Error('Set ICC_RUNNER_TOKEN (create one in Auto Apply → Settings → Runner tokens)');
  const poll = Number(env.APPLY_RUNNER_POLL_MS ?? 60_000);
  log(`runner ${runnerId} → ${env.ICC_API_URL ?? 'http://localhost:3000'}`);
  do {
    let worked = await once().catch((e) => { log(`claim failed: ${(e as Error).message}`); return false; });
    if (!worked && useClaude && !stopping) worked = await agentTask().catch((e) => { log(`agent task failed: ${(e as Error).message}`); return false; });
    if (env.APPLY_RUNNER_ONCE === 'true') break;
    if (!worked && !stopping) await new Promise((r) => setTimeout(r, poll));
  } while (!stopping);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
