import { Injectable, Logger } from '@nestjs/common';
import { LLMConfiguration } from '@prisma/client';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z, ZodType } from 'zod';
import { config } from '../config';
import { decrypt } from '../common/crypto';
import { PrismaService } from '../prisma.service';
import { checkBaseUrl, UnsafeUrlError } from './url-guard';

export interface EffectiveLlmConfig {
  source: 'workspace' | 'env' | 'none';
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  evaluationModel: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  consent: boolean;
  jsonMode?: boolean;
}

export interface LlmStatus {
  available: boolean;
  reason?: string;
  source: EffectiveLlmConfig['source'];
  isLocal?: boolean;
}

/** Errors that should never be retried (config problems) vs. transient ones. */
export class LlmError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

export function describeLlmError(e: unknown, cfg: Pick<EffectiveLlmConfig, 'baseUrl' | 'model' | 'timeoutMs'>): LlmError {
  const host = (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })();
  if (e instanceof LlmError) return e;
  if (e instanceof UnsafeUrlError) return new LlmError(e.message, false);
  if (e instanceof OpenAI.APIConnectionTimeoutError) return new LlmError(`Request to ${host} timed out after ${cfg.timeoutMs} ms`, true);
  if (e instanceof OpenAI.APIConnectionError) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return new LlmError(`Cannot reach ${host}${cause?.code ? ` (${cause.code})` : ''}. Is the server running and is the base URL correct?`, true);
  }
  if (e instanceof OpenAI.AuthenticationError) return new LlmError(`The endpoint rejected the API key (401). Check LLM API key for ${host}.`, false);
  if (e instanceof OpenAI.PermissionDeniedError) return new LlmError(`Access denied by ${host} (403). The key may lack access to model "${cfg.model}".`, false);
  if (e instanceof OpenAI.NotFoundError) return new LlmError(`Not found (404) at ${host}. Check the model name "${cfg.model}" and that the base URL includes the API prefix (often /v1).`, false);
  if (e instanceof OpenAI.RateLimitError) return new LlmError(`Rate limited by ${host} (429). Will retry later.`, true);
  if (e instanceof OpenAI.APIError) {
    const status = e.status ?? 0;
    return new LlmError(`Endpoint error ${status || ''} from ${host}: ${e.message.slice(0, 300)}`, status >= 500 || status === 0);
  }
  return new LlmError(`Unexpected LLM error: ${(e as Error)?.message?.slice(0, 300) ?? String(e)}`, true);
}

/** Pull a JSON object out of model text (handles ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch { /* fall through */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('No JSON object found in model output');
}

@Injectable()
export class LlmService {
  private log = new Logger('LLM');
  constructor(private prisma: PrismaService) {}

  /**
   * Precedence: a workspace's saved configuration (with a base URL) wins; otherwise the environment default.
   * LLM_ENABLED only governs the environment default.
   */
  async effective(workspaceId: string): Promise<EffectiveLlmConfig> {
    const row = await this.prisma.lLMConfiguration.findUnique({ where: { workspaceId } });
    if (row?.baseUrl) return this.fromRow(row);
    const e = config.llm;
    if (e.baseUrl) {
      return {
        source: 'env', enabled: e.enabled, baseUrl: e.baseUrl, apiKey: e.apiKey, model: e.model, evaluationModel: e.evaluationModel,
        timeoutMs: e.timeoutMs, maxRetries: e.maxRetries, temperature: e.temperature, consent: e.externalDataConsent,
        jsonMode: (row?.capabilities as { jsonMode?: boolean } | null)?.jsonMode,
      };
    }
    return { source: 'none', enabled: false, baseUrl: '', apiKey: '', model: '', evaluationModel: '', timeoutMs: e.timeoutMs, maxRetries: e.maxRetries, temperature: e.temperature, consent: false };
  }

  private fromRow(row: LLMConfiguration): EffectiveLlmConfig {
    return {
      source: 'workspace', enabled: row.enabled, baseUrl: row.baseUrl!, apiKey: row.apiKeyEncrypted ? decrypt(row.apiKeyEncrypted) : '',
      model: row.model ?? '', evaluationModel: row.evaluationModel ?? '', timeoutMs: row.timeoutMs, maxRetries: row.maxRetries,
      temperature: row.temperature, consent: row.allowExternalTransmission, jsonMode: (row.capabilities as { jsonMode?: boolean } | null)?.jsonMode,
    };
  }

  /** Cheap, offline check used for routing. Does not call the endpoint. */
  async status(workspaceId: string): Promise<LlmStatus> {
    const cfg = await this.effective(workspaceId);
    if (cfg.source === 'none') return { available: false, source: 'none', reason: 'No LLM endpoint configured' };
    if (!cfg.enabled) return { available: false, source: cfg.source, reason: 'LLM is disabled' };
    if (!cfg.model) return { available: false, source: cfg.source, reason: 'No model configured' };
    try {
      const { isLocal } = await checkBaseUrl(cfg.baseUrl, config.llm.allowPrivateNetwork);
      if (!isLocal && !cfg.consent) {
        return { available: false, source: cfg.source, isLocal, reason: 'Endpoint is not local and sending interview data to it has not been allowed (AI settings)' };
      }
      return { available: true, source: cfg.source, isLocal };
    } catch (e) {
      return { available: false, source: cfg.source, reason: (e as Error).message };
    }
  }

  client(cfg: EffectiveLlmConfig) {
    // apiKey placeholder: local servers (Ollama, LM Studio) accept any value; the SDK requires a non-empty string.
    return new OpenAI({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey || 'not-set', timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
  }

  async chat(opts: {
    workspaceId: string; messages: ChatCompletionMessageParam[]; purpose: string; taskId?: string;
    model?: string; json?: boolean; temperature?: number; cfg?: EffectiveLlmConfig;
  }): Promise<{ content: string; model: string }> {
    const cfg = opts.cfg ?? (await this.effective(opts.workspaceId));
    const st = opts.cfg ? { available: true } as LlmStatus : await this.status(opts.workspaceId);
    if (!st.available) throw new LlmError(st.reason ?? 'LLM unavailable', false);
    await checkBaseUrl(cfg.baseUrl, config.llm.allowPrivateNetwork).catch((e) => { throw describeLlmError(e, cfg); });
    const model = opts.model || cfg.model;
    const started = Date.now();
    const host = new URL(cfg.baseUrl).host;
    try {
      const res = await this.client(cfg).chat.completions.create({
        model, messages: opts.messages, temperature: opts.temperature ?? cfg.temperature,
        ...(opts.json && cfg.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      });
      const content = res.choices[0]?.message?.content ?? '';
      await this.usage(opts.workspaceId, { taskId: opts.taskId, host, model, purpose: opts.purpose, latencyMs: Date.now() - started, success: true, usage: res.usage });
      if (!content.trim()) throw new LlmError('Model returned an empty response', true);
      return { content, model: res.model || model };
    } catch (e) {
      const err = describeLlmError(e, { ...cfg, model });
      await this.usage(opts.workspaceId, { taskId: opts.taskId, host, model, purpose: opts.purpose, latencyMs: Date.now() - started, success: false, error: err.message });
      throw err;
    }
  }

  /** Chat → JSON validated by a zod schema, with one repair round on invalid output. */
  async json<T extends ZodType>(opts: Parameters<LlmService['chat']>[0] & { schema: T }): Promise<{ data: z.infer<T>; model: string }> {
    const first = await this.chat({ ...opts, json: true });
    const tryParse = (text: string) => {
      try {
        const r = opts.schema.safeParse(extractJson(text));
        return r.success ? { ok: true as const, data: r.data } : { ok: false as const, error: r.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    };
    const p1 = tryParse(first.content);
    if (p1.ok) return { data: p1.data, model: first.model };
    this.log.warn(`Invalid JSON from model (${opts.purpose}), attempting repair: ${p1.error}`);
    const second = await this.chat({
      ...opts, json: true,
      messages: [...opts.messages, { role: 'assistant', content: first.content.slice(0, 20000) },
        { role: 'user', content: `Your output failed validation: ${p1.error}. Return ONLY the corrected JSON object, no prose.` }],
    });
    const p2 = tryParse(second.content);
    if (p2.ok) return { data: p2.data, model: second.model };
    throw new LlmError(`Model output did not match the required schema: ${p2.error}`, true);
  }

  /** Connectivity test: models list (optional), a tiny completion, and JSON-mode detection. Records the result. */
  async test(workspaceId: string, cfg?: EffectiveLlmConfig) {
    cfg ??= await this.effective(workspaceId);
    const result: { ok: boolean; latencyMs?: number; models?: string[]; modelListed?: boolean; jsonMode?: boolean; error?: string; reply?: string } = { ok: false };
    if (cfg.source === 'none' || !cfg.baseUrl) return { ...result, error: 'No LLM endpoint configured' };
    if (!cfg.model) return { ...result, error: 'No model configured' };
    const started = Date.now();
    try {
      await checkBaseUrl(cfg.baseUrl, config.llm.allowPrivateNetwork);
      const client = new OpenAI({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey || 'not-set', timeout: Math.min(cfg.timeoutMs, 30000), maxRetries: 0 });
      try {
        const list = await client.models.list();
        result.models = list.data.map((m) => m.id).slice(0, 200);
        result.modelListed = result.models.includes(cfg.model);
      } catch (e) {
        if (e instanceof OpenAI.AuthenticationError) throw e; // a bad key is a real failure; a missing /models is not
      }
      const res = await client.chat.completions.create({ model: cfg.model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 5, temperature: 0 });
      result.reply = res.choices[0]?.message?.content?.slice(0, 50) ?? '';
      result.latencyMs = Date.now() - started;
      try {
        await client.chat.completions.create({ model: cfg.model, messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }], response_format: { type: 'json_object' }, max_tokens: 20, temperature: 0 });
        result.jsonMode = true;
      } catch {
        result.jsonMode = false;
      }
      result.ok = true;
    } catch (e) {
      result.error = describeLlmError(e, cfg).message;
    }
    await this.prisma.lLMConfiguration.upsert({
      where: { workspaceId },
      create: { workspaceId, baseUrl: null, lastTestAt: new Date(), lastTestOk: result.ok, lastTestError: result.error ?? null, lastSuccessAt: result.ok ? new Date() : undefined, capabilities: { jsonMode: result.jsonMode ?? false, models: result.models ?? [] } },
      update: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestError: result.error ?? null, ...(result.ok && { lastSuccessAt: new Date(), capabilities: { jsonMode: result.jsonMode ?? false, models: result.models ?? [] } }) },
    });
    return result;
  }

  private async usage(workspaceId: string, u: { taskId?: string; host: string; model: string; purpose: string; latencyMs: number; success: boolean; error?: string; usage?: OpenAI.CompletionUsage }) {
    await this.prisma.aIUsageRecord.create({
      data: {
        workspaceId, taskId: u.taskId, host: u.host, model: u.model, purpose: u.purpose, latencyMs: u.latencyMs, success: u.success, error: u.error,
        promptTokens: u.usage?.prompt_tokens, completionTokens: u.usage?.completion_tokens, totalTokens: u.usage?.total_tokens,
      },
    });
    if (u.success) await this.prisma.lLMConfiguration.updateMany({ where: { workspaceId }, data: { lastSuccessAt: new Date() } });
  }
}

