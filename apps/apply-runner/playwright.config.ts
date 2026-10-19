import { defineConfig } from '@playwright/test';

// Runs the apply engine against local mock ATS pages only. Never points at real job sites.
export default defineConfig({ testDir: './tests', timeout: 60_000, workers: 1 });
