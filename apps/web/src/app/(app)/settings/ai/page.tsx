'use client';
import { CheckCircle2, PlugZap, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, PageHeader, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

interface Cfg {
  source: 'workspace' | 'env' | 'none';
  status: { available: boolean; reason?: string; isLocal?: boolean };
  workspace: null | { enabled: boolean; baseUrl: string; model: string; evaluationModel?: string; timeoutMs: number; maxRetries: number; temperature: number; allowExternalTransmission: boolean; hasApiKey: boolean; apiKeyLast4?: string };
  env: null | { enabled: boolean; baseUrl: string; model: string; hasApiKey: boolean; externalDataConsent: boolean };
  lastTest: null | { at?: string; ok?: boolean; error?: string; lastSuccessAt?: string; capabilities?: { jsonMode?: boolean; models?: string[] } };
  allowPrivateNetwork: boolean;
}
interface TestResult { ok: boolean; latencyMs?: number; models?: string[]; modelListed?: boolean; jsonMode?: boolean; error?: string; reply?: string }

const PRESETS = [
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1:8b' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '' },
  { name: 'vLLM', baseUrl: 'http://localhost:8000/v1', model: '' },
  { name: 'Ollama from Docker', baseUrl: 'http://host.docker.internal:11434/v1', model: 'llama3.1:8b' },
];

export default function AiSettings() {
  const { data, error, isLoading, mutate } = useApi<Cfg>('/llm/config');
  const { data: me } = useMe();
  const { data: usage } = useApi<{ recent: { id: string; model: string; purpose: string; success: boolean; totalTokens?: number; latencyMs: number; createdAt: string; error?: string }[] }>('/llm/usage');
  const [f, setF] = useState({ enabled: true, baseUrl: '', apiKey: '', model: '', evaluationModel: '', timeoutMs: '120000', maxRetries: '2', temperature: '0.2', allowExternalTransmission: false });
  const [keyTouched, setKeyTouched] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    const w = data?.workspace;
    if (w) setF({ enabled: w.enabled, baseUrl: w.baseUrl, apiKey: '', model: w.model, evaluationModel: w.evaluationModel ?? '', timeoutMs: String(w.timeoutMs), maxRetries: String(w.maxRetries), temperature: String(w.temperature), allowExternalTransmission: w.allowExternalTransmission });
  }, [data]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const owner = me?.role === 'OWNER';
  const body = () => ({
    enabled: f.enabled, baseUrl: f.baseUrl, model: f.model, evaluationModel: f.evaluationModel || null, timeoutMs: Number(f.timeoutMs), maxRetries: Number(f.maxRetries),
    temperature: Number(f.temperature), allowExternalTransmission: f.allowExternalTransmission, ...(keyTouched && { apiKey: f.apiKey }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="AI configuration" description="One OpenAI-compatible endpoint: Ollama, vLLM, LM Studio, a hosted provider or a gateway. Everything except AI actions keeps working without it." />
      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        {data.status.available ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-warning" />}
        <div className="flex-1"><p className="font-medium">{data.status.available ? 'AI actions enabled' : 'AI actions unavailable'}</p><p className="text-xs text-muted">{data.status.reason ?? `Using ${data.source === 'env' ? 'the server environment configuration' : 'this workspace configuration'}${data.status.isLocal ? ' · local endpoint' : ''}`}</p></div>
        <Badge>source: {data.source}</Badge>
        {data.lastTest?.at && <Badge tone={data.lastTest.ok ? 'success' : 'danger'}>last test {data.lastTest.ok ? 'passed' : 'failed'} · {fmtDate(data.lastTest.at, true)}</Badge>}
        {data.lastTest?.lastSuccessAt && <span className="text-xs text-muted">Last successful call {fmtDate(data.lastTest.lastSuccessAt, true)}</span>}
      </Card>
      {data.env && <p className="text-xs text-muted">Server default (environment): {data.env.baseUrl} · model {data.env.model || '—'} · {data.env.enabled ? 'enabled' : 'disabled (LLM_ENABLED=false)'}. A saved workspace configuration takes precedence.</p>}

      <Card>
        <CardHeader title="Workspace endpoint" description={owner ? 'Saved API keys are encrypted at rest and never shown again.' : 'Only the workspace owner can change this.'} />
        <form className="space-y-3 p-4" onSubmit={async (e) => { e.preventDefault(); if (await run('save', () => api('/llm/config', { method: 'PUT', body: body() }), 'Configuration saved')) { setKeyTouched(false); setF({ ...f, apiKey: '' }); mutate(); } }}>
          <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <Button key={p.name} size="sm" variant="secondary" onClick={() => setF({ ...f, baseUrl: p.baseUrl, model: f.model || p.model })}>{p.name}</Button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Base URL" hint="Usually ends with /v1"><Input required value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" disabled={!owner} /></Field>
            <Field label="Model" hint={data.lastTest?.capabilities?.models?.length ? `Available: ${data.lastTest.capabilities.models.slice(0, 6).join(', ')}` : undefined}><Input required value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} list="models" disabled={!owner} /><datalist id="models">{data.lastTest?.capabilities?.models?.map((m) => <option key={m} value={m} />)}</datalist></Field>
            <Field label="API key" hint={data.workspace?.hasApiKey && !keyTouched ? `Saved key ending “${data.workspace.apiKeyLast4}”. Leave untouched to keep it; clear the field and save to remove.` : 'Leave empty for local servers that need no key.'}>
              <Input type="password" autoComplete="off" value={f.apiKey} placeholder={data.workspace?.hasApiKey ? '••••••••' : ''} onChange={(e) => { setKeyTouched(true); setF({ ...f, apiKey: e.target.value }); }} disabled={!owner} />
            </Field>
            <Field label="Evaluation model (optional)" hint="A stronger model for answer evaluation, same endpoint."><Input value={f.evaluationModel} onChange={(e) => setF({ ...f, evaluationModel: e.target.value })} disabled={!owner} /></Field>
            <Field label="Timeout (ms)"><Input type="number" min={1000} value={f.timeoutMs} onChange={(e) => setF({ ...f, timeoutMs: e.target.value })} disabled={!owner} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Max retries"><Input type="number" min={0} max={5} value={f.maxRetries} onChange={(e) => setF({ ...f, maxRetries: e.target.value })} disabled={!owner} /></Field>
              <Field label="Temperature"><Input type="number" step={0.1} min={0} max={2} value={f.temperature} onChange={(e) => setF({ ...f, temperature: e.target.value })} disabled={!owner} /></Field>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} disabled={!owner} />Enable AI actions</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.allowExternalTransmission} onChange={(e) => setF({ ...f, allowExternalTransmission: e.target.checked })} disabled={!owner} /><span>Allow sending my interview data (job descriptions, CV excerpts, answers) to this endpoint when it is <strong>not</strong> on this machine / local network.<span className="block text-xs text-muted">Local endpoints never need this. Only the context relevant to each task is sent.</span></span></label>
          {!data.allowPrivateNetwork && <p className="text-xs text-warning">This server blocks private and loopback addresses (LLM_ALLOW_PRIVATE_NETWORK=false).</p>}
          {owner && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy === 'save'}>Save</Button>
              <Button variant="outline" loading={busy === 'test'} onClick={async () => { setTest(null); const r = await run('test', () => api<TestResult>('/llm/test', { body: f.baseUrl ? { baseUrl: f.baseUrl, model: f.model, timeoutMs: Number(f.timeoutMs), ...(keyTouched && { apiKey: f.apiKey }) } : {} })); if (r) { setTest(r); mutate(); } }}><PlugZap className="h-4 w-4" />Test connection</Button>
              {data.workspace && <Button variant="ghost" onClick={async () => { if (confirm('Remove the workspace configuration (falls back to the server default)?')) { await run('clear', () => api('/llm/config', { method: 'DELETE' }), 'Removed'); mutate(); } }}>Remove</Button>}
            </div>
          )}
          {test && (
            <div className={`rounded-md border p-3 text-sm ${test.ok ? 'border-success/30 bg-success-soft' : 'border-danger/30 bg-danger-soft text-danger'}`}>
              {test.ok ? <>
                <p className="font-medium text-success">Connected · {test.latencyMs} ms · replied “{test.reply}”</p>
                <p className="text-xs">Model {test.modelListed === undefined ? 'listing not supported by this endpoint' : test.modelListed ? 'found in /models' : 'NOT listed in /models (may still work)'} · JSON mode {test.jsonMode ? 'supported' : 'not supported (prompt-based JSON will be used)'}</p>
              </> : <p>{test.error}</p>}
            </div>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader title="Recent AI calls" description="Token counts appear when the endpoint reports them." />
        <ul className="divide-y divide-border text-xs">
          {usage?.recent.map((u) => <li key={u.id} className="flex flex-wrap justify-between gap-2 px-4 py-2"><span>{u.purpose.replace(/_/g, ' ')} · {u.model}</span><span className={u.success ? 'text-muted' : 'text-danger'}>{u.success ? `${u.totalTokens ?? '?'} tokens · ${u.latencyMs} ms` : u.error}</span><span className="text-muted">{fmtDate(u.createdAt, true)}</span></li>)}
          {!usage?.recent.length && <li className="px-4 py-3 text-muted">No calls yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
