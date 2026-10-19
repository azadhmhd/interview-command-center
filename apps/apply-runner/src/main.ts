/**
 * Interview Command Center apply runner (runs on your machine, next to a real browser).
 *
 *   ICC_API_URL=http://localhost:3000 ICC_RUNNER_TOKEN=<token> pnpm apply:runner
 *
 * Env: APPLY_RUNNER_PROFILE (default "jobs"), APPLY_RUNNER_HEADLESS=true|false (default false = visible),
 *      APPLY_RUNNER_ONCE=true (one job then exit), APPLY_RUNNER_POLL_MS (default 60000).
 * The mode (auto-submit vs. fill-only) comes from your Auto Apply settings, checked again by the server before Submit.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { IccApi } from './api';
import { openProfile } from './browser';
import { applyOnPage } from './engine';

const env = process.env;
const api = new IccApi(env.ICC_API_URL ?? 'http://localhost:3000', env.ICC_RUNNER_TOKEN ?? '');
const runnerId = `${hostname()}:${process.pid}`;
const log = (m: string) => console.log(`[apply-runner ${new Date().toISOString()}] ${m}`);
let stopping = false;
process.on('SIGINT', () => { stopping = true; log('stopping after the current job…'); });

async function once(): Promise<boolean> {
  const claim = await api.claim(runnerId);
  if (!claim.attempt || !claim.lead) { log(claim.reason ?? 'nothing to do'); return false; }
  const { attempt, lead, mode } = claim;
  log(`attempt ${attempt.attemptNo} · ${lead.title} at ${lead.company} · ${mode === 'auto' ? 'AUTO-SUBMIT' : 'fill only, you submit'}`);
  const tmp = mkdtempSync(join(tmpdir(), 'icc-apply-'));
  const beat = setInterval(() => api.heartbeat(attempt.id).catch(() => undefined), 60_000);
  const profile = await openProfile(env.APPLY_RUNNER_PROFILE ?? 'jobs', { headless: env.APPLY_RUNNER_HEADLESS === 'true' });
  try {
    let resumePath: string | undefined;
    if (lead.resume) {
      resumePath = join(tmp, `cv${extname(lead.resume.fileName) || '.pdf'}`);
      writeFileSync(resumePath, await api.downloadResume(lead.resume.id), { mode: 0o600 });
    }
    const page = profile.context.pages()[0] ?? (await profile.context.newPage());
    const result = await applyOnPage(page, lead, { submitIntent: () => api.submitIntent(attempt.id), heartbeat: () => api.heartbeat(attempt.id).then(() => undefined), log }, { mode: mode ?? 'prefill', resumePath });
    const r = await api.result(attempt.id, result);
    log(`→ ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
  } catch (e) {
    log(`error: ${(e as Error).message}`);
    await api.result(attempt.id, { status: 'FAILED', error: (e as Error).message, filledFields: [], missingFields: [] }).catch(() => undefined);
  } finally {
    clearInterval(beat);
    await profile.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  return true;
}

async function main() {
  if (!env.ICC_RUNNER_TOKEN) throw new Error('Set ICC_RUNNER_TOKEN (create one in Auto Apply → Settings → Runner tokens)');
  const poll = Number(env.APPLY_RUNNER_POLL_MS ?? 60_000);
  log(`runner ${runnerId} → ${env.ICC_API_URL ?? 'http://localhost:3000'}`);
  do {
    const worked = await once().catch((e) => { log(`claim failed: ${(e as Error).message}`); return false; });
    if (env.APPLY_RUNNER_ONCE === 'true') break;
    if (!worked && !stopping) await new Promise((r) => setTimeout(r, poll));
  } while (!stopping);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
