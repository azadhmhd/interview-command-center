import { defineConfig } from '@playwright/test';

// Runs against an already-running stack (web :3000 → api :4000). See docs/TESTING.md.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 }, // dev servers compile pages on first visit
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure' },
  // PW_CHANNEL=chrome reuses an installed Google Chrome instead of downloading Playwright's Chromium.
  projects: [{ name: 'chromium', use: { browserName: 'chromium', ...(process.env.PW_CHANNEL && { channel: process.env.PW_CHANNEL }), ...(process.env.PW_EXECUTABLE && { launchOptions: { executablePath: process.env.PW_EXECUTABLE } }) } }],
});
