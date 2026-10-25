import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load the repo-root .env for local runs (Node stdlib). In Docker, env comes from compose.
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const env = process.env;
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : v === 'true' || v === '1');
const int = (v: string | undefined, d: number) => (v ? Number.parseInt(v, 10) : d);

export const config = {
  appName: env.APP_NAME || 'Interview Command Center',
  appUrl: env.APP_URL || 'http://localhost:3000',
  port: int(env.API_PORT, 4000),
  cookieSecure: bool(env.COOKIE_SECURE, false),
  encryptionKey: env.APP_ENCRYPTION_KEY || '',
  redisUrl: env.REDIS_URL || 'redis://localhost:6380',
  uploadDir: resolve(env.UPLOAD_DIR || './data/uploads'),
  maxUploadBytes: int(env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  /** S3-compatible object storage (MinIO locally). Empty endpoint = files stay in uploadDir. */
  s3: {
    endpoint: env.S3_ENDPOINT || '',
    bucket: env.S3_BUCKET || 'icc',
    region: env.S3_REGION || 'us-east-1',
    accessKey: env.S3_ACCESS_KEY || '',
    secretKey: env.S3_SECRET_KEY || '',
  },
  agentWorkspaceDir: resolve(env.AGENT_WORKSPACE_DIR || '../../agent-workspace/tasks'),
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'icc@localhost',
  llm: {
    enabled: bool(env.LLM_ENABLED, false),
    baseUrl: env.LLM_BASE_URL || '',
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || '',
    evaluationModel: env.LLM_EVALUATION_MODEL || '',
    timeoutMs: int(env.LLM_TIMEOUT_MS, 120000),
    maxRetries: int(env.LLM_MAX_RETRIES, 2),
    temperature: Number(env.LLM_DEFAULT_TEMPERATURE ?? 0.2),
    allowPrivateNetwork: bool(env.LLM_ALLOW_PRIVATE_NETWORK, true),
    externalDataConsent: bool(env.LLM_EXTERNAL_DATA_CONSENT, false),
  },
  claudeCli: {
    enabled: bool(env.AGENT_CLAUDE_CLI_ENABLED, false),
    path: env.AGENT_CLAUDE_CLI_PATH || 'claude',
    timeoutMs: int(env.AGENT_CLAUDE_CLI_TIMEOUT_MS, 900000),
  },
  /** Resume PDFs: a headless Chromium prints the web app's /print/resume page. */
  pdf: {
    enabled: bool(env.PDF_ENABLED, true),
    webUrl: env.WEB_INTERNAL_URL || 'http://localhost:3000',
    timeoutMs: int(env.PDF_TIMEOUT_MS, 30000),
  },
  schedulerTickMs: int(env.SCHEDULER_TICK_MS, 30000),
  workerConcurrency: int(env.WORKER_CONCURRENCY, 2),
};

export function assertConfig() {
  if (Buffer.from(config.encryptionKey, 'base64').length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded. See .env.example.');
  }
}
