import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://icc:icc@localhost:5434/icc_test';
process.env.THROTTLE_AUTH_LIMIT = '10000';
process.env.AUTOAPPLY_ALLOW_CUSTOM_BASE_URL = 'true';
process.env.AUTOAPPLY_RUN_WAIT_MS = '3000'; // fake job-board server in tests only
process.env.REDIS_URL = (process.env.REDIS_URL || 'redis://localhost:6380').replace(/\/\d*$/, '') + '/1'; // separate queue DB from dev
process.env.LLM_ENABLED = 'false';
process.env.LLM_BASE_URL = '';
process.env.AGENT_CLAUDE_CLI_ENABLED = 'false';
const root = mkdtempSync(join(tmpdir(), 'icc-e2e-'));
process.env.UPLOAD_DIR = join(root, 'uploads');
// MinIO is opt-in for tests: TEST_S3_ENDPOINT=http://localhost:9010 runs the same suite against the bucket
process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT || '';
process.env.S3_BUCKET = 'icc-test';
process.env.S3_ACCESS_KEY ||= 'icc';
process.env.S3_SECRET_KEY ||= 'icc-local-secret';
// PDF tests need the web app: TEST_WEB_URL=http://localhost:3100 renders through it; without it rendering is off
process.env.WEB_INTERNAL_URL = process.env.TEST_WEB_URL || '';
process.env.PDF_ENABLED = process.env.TEST_WEB_URL ? 'true' : 'false';
process.env.AGENT_WORKSPACE_DIR = join(root, 'agent-workspace', 'tasks');
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
