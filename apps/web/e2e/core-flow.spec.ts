import { expect, test } from '@playwright/test';

// The core workflow through the real UI with no LLM configured:
// register → application → round → capture question → prepare plan → practice → self-evaluate.
test('job seeker core flow works end to end without AI', async ({ page }) => {
  const email = `ui-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('UI Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('ui-test-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/settings\/profile/);

  await page.goto('/applications?new=1');
  await page.getByLabel('Company *').fill('Acme Robotics');
  await page.getByLabel('Job title *').fill('Senior Python Engineer');
  await page.getByLabel('Job description').fill('Python, FastAPI, PostgreSQL, Redis, Kafka. Build RAG features.');
  await page.getByRole('button', { name: 'Create application' }).click();
  await expect(page.getByRole('heading', { name: /Acme Robotics/ })).toBeVisible();

  const when = new Date(Date.now() + 3 * 864e5);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  await page.getByLabel('Round type').selectOption('backend');
  await page.getByLabel('Round title').fill('Backend deep dive');
  await page.getByLabel('Scheduled at').fill(local);
  await page.getByRole('button', { name: 'Add round' }).click();
  await page.getByRole('link', { name: 'Backend deep dive' }).click();

  await page.getByRole('button', { name: 'Capture question' }).click();
  await page.getByLabel('Question (required)').fill('How do you find N+1 queries in Django?');
  await page.getByLabel(/Your original answer/).fill('Django debug toolbar and select_related.');
  await page.getByRole('button', { name: 'Save & close' }).click();
  await expect(page.getByText('How do you find N+1 queries in Django?')).toBeVisible();

  // The worker may already have auto-prepared the course from the short-notice milestone.
  await page.getByRole('button', { name: /^(Prepare for this round|Update preparation plan)$/ }).click();
  await expect(page).toHaveURL(/\/courses\//, { timeout: 30_000 });
  await expect(page.getByText('Baseline plan (no AI)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Your past interview questions & mistakes' })).toBeVisible();

  await page.getByRole('link', { name: 'Django & FastAPI in production' }).click();
  const box = page.getByLabel(/Your answer to:/).first();
  await box.fill('Use select_related for FK joins and prefetch_related for reverse relations.');
  await page.getByRole('button', { name: 'Submit attempt' }).first().click();
  // With no automatic evaluator the user self-assesses; with an LLM or Claude Code configured, evaluation runs in the background.
  const selfEval = page.getByText('No AI evaluator available right now');
  await expect(selfEval.or(page.getByText(/^Evaluating with/))).toBeVisible();
  if (await selfEval.isVisible()) {
    await page.getByRole('button', { name: 'Save self-evaluation' }).click();
    await expect(page.getByText(/self-assessed/)).toBeVisible();
  }

  await page.goto('/questions');
  await expect(page.getByText('How do you find N+1 queries in Django?')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText('Upcoming interviews', { exact: false }).first()).toBeVisible();
});
