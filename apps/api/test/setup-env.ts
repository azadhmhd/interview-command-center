import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://icc:icc@localhost:5434/icc_test';
process.env.THROTTLE_AUTH_LIMIT = '10000';
process.env.REDIS_URL = (process.env.REDIS_URL || 'redis://localhost:6380').replace(/\/\d*$/, '') + '/1'; // separate queue DB from dev
process.env.LLM_ENABLED = 'false';
process.env.LLM_BASE_URL = '';
process.env.AGENT_CLAUDE_CLI_ENABLED = 'false';
const root = mkdtempSync(join(tmpdir(), 'icc-e2e-'));
process.env.UPLOAD_DIR = join(root, 'uploads');
process.env.AGENT_WORKSPACE_DIR = join(root, 'agent-workspace', 'tasks');
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
