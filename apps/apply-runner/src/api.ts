import type { EngineResult, Kit } from './engine';

export interface AgentPackage {
  context: { job: { title: string; company: string; applyUrl: string; atsType: string }; kit: Kit | null; autoSubmit: boolean; duplicateCheck: string };
}

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

  claim(runner: string, engine: 'playwright' | 'claude' = 'playwright') { return this.req<Claim>('POST', '/autoapply/runner/claim', { runner, engine }); }
  heartbeat(id: string) { return this.req<{ ok: boolean }>('POST', `/autoapply/runner/attempts/${id}/heartbeat`); }
  submitIntent(id: string) { return this.req<{ ok: boolean; reason?: string }>('POST', `/autoapply/runner/attempts/${id}/submit-intent`); }
  result(id: string, r: EngineResult) { return this.req<{ status: string; leadStatus: string; reason?: string }>('POST', `/autoapply/runner/attempts/${id}/result`, r); }

  // agent tasks: "Apply with Claude Code" job_application tasks, run here instead of by hand
  agentTasks() { return this.req<{ id: string; title: string }[]>('GET', '/tasks?state=ready_for_agent&type=job_application'); }
  task(id: string) { return this.req<{ id: string; state: string; inputSnapshot: { leadId?: string } | null }>('GET', `/tasks/${id}`); }
  taskPackage(id: string) { return this.req<AgentPackage>('GET', `/tasks/${id}/package`); }
  /** ready_for_agent → submitted: this runner has it, so nothing picks it up twice */
  takeTask(id: string) { return this.req<unknown>('POST', `/tasks/${id}/submitted`); }
  importTask(id: string, output: unknown) { return this.req<unknown>('POST', `/tasks/${id}/import`, { output }); }
  lead(id: string) { return this.req<{ resumeId?: string | null; resume?: { id: string; fileName: string } | null }>('GET', `/autoapply/leads/${id}`); }

  async downloadResume(id: string): Promise<Buffer> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/api/resumes/${id}/file`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`CV download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}
