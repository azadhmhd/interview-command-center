import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { encrypt } from '../common/crypto';
import { ApiZod, Ctx, CurrentCtx, MinRole, zp } from '../common/http';
import { PrismaService } from '../prisma.service';
import { EffectiveLlmConfig, LlmService } from './llm.service';
import { checkBaseUrl, UnsafeUrlError } from './url-guard';

const configSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().max(500).trim(),
  /** omitted/undefined = keep existing key; empty string = clear it */
  apiKey: z.string().max(1000).optional(),
  model: z.string().min(1).max(200).trim(),
  evaluationModel: z.string().max(200).trim().optional().nullable(),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  temperature: z.number().min(0).max(2).default(0.2),
  allowExternalTransmission: z.boolean().default(false),
});
const testSchema = configSchema.partial();

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(private prisma: PrismaService, private llm: LlmService, private audit: AuditService) {}

  /** Never returns the API key — only whether one is set and its last 4 characters. */
  @Get('config')
  async get(@CurrentCtx() ctx: Ctx) {
    const row = await this.prisma.lLMConfiguration.findUnique({ where: { workspaceId: ctx.workspaceId } });
    const eff = await this.llm.effective(ctx.workspaceId);
    const status = await this.llm.status(ctx.workspaceId);
    return {
      source: eff.source,
      status,
      workspace: row?.baseUrl ? {
        enabled: row.enabled, baseUrl: row.baseUrl, model: row.model, evaluationModel: row.evaluationModel, timeoutMs: row.timeoutMs,
        maxRetries: row.maxRetries, temperature: row.temperature, allowExternalTransmission: row.allowExternalTransmission,
        hasApiKey: !!row.apiKeyEncrypted, apiKeyLast4: row.apiKeyLast4,
      } : null,
      env: config.llm.baseUrl ? { enabled: config.llm.enabled, baseUrl: config.llm.baseUrl, model: config.llm.model, hasApiKey: !!config.llm.apiKey, externalDataConsent: config.llm.externalDataConsent } : null,
      lastTest: row ? { at: row.lastTestAt, ok: row.lastTestOk, error: row.lastTestError, lastSuccessAt: row.lastSuccessAt, capabilities: row.capabilities } : null,
      allowPrivateNetwork: config.llm.allowPrivateNetwork,
    };
  }

  @Put('config') @MinRole('OWNER') @ApiZod(configSchema)
  async save(@CurrentCtx() ctx: Ctx, @Body(zp(configSchema)) body: z.infer<typeof configSchema>) {
    try {
      await checkBaseUrl(body.baseUrl, config.llm.allowPrivateNetwork);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new BadRequestException(e.message);
      throw e;
    }
    const keyData = body.apiKey === undefined ? {} : body.apiKey === ''
      ? { apiKeyEncrypted: null, apiKeyLast4: null }
      : { apiKeyEncrypted: encrypt(body.apiKey), apiKeyLast4: body.apiKey.slice(-4) };
    const { apiKey: _, ...rest } = body;
    const data = { ...rest, evaluationModel: rest.evaluationModel || null, ...keyData };
    await this.prisma.lLMConfiguration.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId, ...data }, update: { ...data, capabilities: undefined } });
    await this.audit.record(ctx, 'llm.config_saved', { type: 'llm_config', id: ctx.workspaceId }, { baseUrl: body.baseUrl, model: body.model, keyChanged: body.apiKey !== undefined });
    return this.get(ctx);
  }

  @Delete('config') @MinRole('OWNER')
  async clear(@CurrentCtx() ctx: Ctx) {
    await this.prisma.lLMConfiguration.deleteMany({ where: { workspaceId: ctx.workspaceId } });
    await this.audit.record(ctx, 'llm.config_cleared', { type: 'llm_config', id: ctx.workspaceId });
    return this.get(ctx);
  }

  /** Test saved config, or unsaved values from the form (missing apiKey falls back to the saved one). */
  @Post('test') @HttpCode(200) @MinRole('OWNER') @ApiZod(testSchema)
  async test(@CurrentCtx() ctx: Ctx, @Body(zp(testSchema)) body: z.infer<typeof testSchema>) {
    const saved = await this.llm.effective(ctx.workspaceId);
    const cfg: EffectiveLlmConfig = body.baseUrl
      ? { ...saved, source: 'workspace', enabled: true, baseUrl: body.baseUrl, model: body.model ?? saved.model, apiKey: body.apiKey ?? saved.apiKey, timeoutMs: body.timeoutMs ?? saved.timeoutMs }
      : saved;
    return this.llm.test(ctx.workspaceId, cfg);
  }

  @Get('usage')
  async usage(@CurrentCtx() ctx: Ctx) {
    const since = new Date(Date.now() - 30 * 864e5);
    const rows = await this.prisma.aIUsageRecord.groupBy({
      by: ['model', 'purpose', 'success'], where: { workspaceId: ctx.workspaceId, createdAt: { gte: since } },
      _count: true, _sum: { promptTokens: true, completionTokens: true, totalTokens: true }, _avg: { latencyMs: true },
    });
    const recent = await this.prisma.aIUsageRecord.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { last30Days: rows, recent };
  }
}
