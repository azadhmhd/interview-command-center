import { expect, test } from '@playwright/test';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyWithClaude, buildPrompt, parseResult } from '../src/claude';
import type { ApplyJob } from '../src/engine';

const job: ApplyJob = {
  id: 'lead1', title: 'Backend Engineer', company: 'Acme', applyUrl: 'https://jobs.example.test/acme/1', atsType: 'ashby',
  kit: { answers: [
    { key: '_systemfield_name', label: 'Name', required: true, type: 'input_text', answer: 'Sam Rivera' },
    { key: '_systemfield_resume', label: 'Resume', required: true, type: 'input_file', answer: 'Attach CV: Main CV' },
    { key: 'q1', label: 'Open to relocation?', required: true, type: 'multi_value_single_select', answer: 'Yes', options: ['Yes', 'No'] },
  ] },
};

/** A stand-in for the `claude` binary: prints Claude Code's JSON output with the given reply. */
const fakeClaude = (reply: string, exit = 0) => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  const bin = join(dir, 'claude');
  writeFileSync(bin, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ result: ${JSON.stringify(reply)} }));\nprocess.exit(${exit});\n`);
  chmodSync(bin, 0o755);
  return bin;
};

test('prompt: kit answers, the CV path, the submit mode and the never-guess / never-bypass rules', () => {
  const p = buildPrompt(job, 'auto', '/tmp/x/Sam_Rivera_CV.pdf');
  expect(p).toContain('https://jobs.example.test/acme/1');
  expect(p).toContain('"answer": "Sam Rivera"');
  expect(p).toContain('/tmp/x/Sam_Rivera_CV.pdf');
  expect(p).toContain('AUTO-SUBMIT');
  expect(p).toMatch(/CAPTCHA.*report BLOCKED/);
  expect(p).toMatch(/Never\s+create an account, sign up or enter a password/);
  expect(p).toMatch(/REQUIRED field without a kit answer: do not guess/);
  expect(p).not.toContain('Attach CV: Main CV'); // file answers are not text to type
  expect(buildPrompt(job, 'prefill')).toContain('do NOT click Submit');
  expect(buildPrompt(job, 'auto', undefined, 'dev-123')).toMatch(/call select_browser with deviceId "dev-123"\. Use only that browser/);
  expect(p).not.toContain('select_browser'); // one browser connected: nothing to pick
});

test('result: only a well-formed SUBMITTED line counts; anything else needs attention', () => {
  const ok = parseResult('Filled everything.\nRESULT_JSON: {"status":"SUBMITTED","confirmationUrl":"https://jobs.example.test/acme/1/confirmation","confirmationText":"Thank you for applying","filledFields":[{"label":"Name","value":"Sam Rivera"}],"missingFields":[]}');
  expect(ok).toMatchObject({ status: 'SUBMITTED', evidence: { confirmationText: 'Thank you for applying' }, missingFields: [] });
  expect(parseResult('I could not finish').status).toBe('NEEDS_ATTENTION');
  expect(parseResult('RESULT_JSON: {not json').status).toBe('NEEDS_ATTENTION');
  expect(parseResult('RESULT_JSON: {"status":"DONE"}').status).toBe('NEEDS_ATTENTION');
  expect(parseResult('RESULT_JSON: {"status":"BLOCKED","notes":"CAPTCHA shown"}')).toMatchObject({ status: 'BLOCKED', error: 'CAPTCHA shown' });
  // "never clicked Submit" only counts for a run that did not submit; missing or unsure stays a possible submission
  expect(parseResult('RESULT_JSON: {"status":"BLOCKED","submitClicked":false,"notes":"Sign-up wall"}').submitClicked).toBe(false);
  expect(parseResult('RESULT_JSON: {"status":"NEEDS_ATTENTION","notes":"no confirmation"}').submitClicked).toBeUndefined();
  expect(parseResult('RESULT_JSON: {"status":"SUBMITTED","submitClicked":false,"confirmationText":"Thanks"}').submitClicked).toBeUndefined();
});

test('runs the claude binary and reads its result; a crash without a result is FAILED', async () => {
  const r = await applyWithClaude(job, 'auto', undefined, { bin: fakeClaude('done\nRESULT_JSON: {"status":"SUBMITTED","confirmationText":"Your application was successfully submitted.","filledFields":[],"missingFields":[]}') });
  expect(r).toMatchObject({ status: 'SUBMITTED', evidence: { confirmationText: 'Your application was successfully submitted.' } });
  expect((await applyWithClaude(job, 'auto', undefined, { bin: fakeClaude('rate limited', 1) })).status).toBe('FAILED');
  expect((await applyWithClaude(job, 'auto', undefined, { bin: '/nonexistent/claude' })).status).toBe('FAILED');
});
