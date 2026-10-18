import type { EngineResult, Kit } from './engine';

export interface Claim {
  attempt: { id: string; attemptNo: number } | null;
  reason?: string;
  mode?: 'auto' | 'prefill';
  lead?: { id: string; title: string; company: string; applyUrl: string; atsType: string; kit: Kit; resume: { id: string; fileName: string } | null };
}

/** Talks to the Interview Command Center API with a personal runner token (Settings → Auto Apply → Runner tokens). */
export class IccApi {
  constructor(private base: string, private token: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/api${path}`, {
      method, headers: { authorization: `Bearer ${this.token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  claim(runner: string) { return this.req<Claim>('POST', '/autoapply/runner/claim', { runner }); }
  heartbeat(id: string) { return this.req<{ ok: boolean }>('POST', `/autoapply/runner/attempts/${id}/heartbeat`); }
  submitIntent(id: string) { return this.req<{ ok: boolean; reason?: string }>('POST', `/autoapply/runner/attempts/${id}/submit-intent`); }
  result(id: string, r: EngineResult) { return this.req<{ status: string; leadStatus: string; reason?: string }>('POST', `/autoapply/runner/attempts/${id}/result`, r); }

  async downloadResume(id: string): Promise<Buffer> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/api/resumes/${id}/file`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`CV download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}
