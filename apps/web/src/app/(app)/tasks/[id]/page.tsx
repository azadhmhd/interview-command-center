'use client';
import { Check, Download, FolderOpen, RefreshCw, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, PageHeader, StateBadge, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import type { Task } from '@/lib/types';
import { fmtDate, relTime } from '@/lib/utils';

const STATE_HELP: Record<string, string> = {
  scheduled: 'Scheduled — the worker will route it when due.',
  queued: 'Queued — waiting for the worker.',
  running: 'Running now in the worker.',
  ready_for_agent: 'Ready for manual execution by a coding agent. Export the package, run the skill, then sync or upload the output.',
  submitted: 'Marked as handed to an agent. Sync or upload the output when it is done.',
  awaiting_review: 'Output imported and validated. Review the result in the app, then approve or reject.',
  retry_wait: 'Waiting for the retry backoff to elapse.',
  failed: 'Failed. Retry, or hand off to an agent.',
  completed: 'Completed and validated.',
  cancelled: 'Cancelled.',
};

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, error, isLoading, mutate } = useApi<Task & { inputSnapshot: unknown }>(`/tasks/${id}`, { refreshInterval: (d) => (d && ['queued', 'running'].includes(d.state) ? 2000 : 0) });
  const { busy, run } = useAction();
  const [pkgDir, setPkgDir] = useState('');
  const [paste, setPaste] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  if (isLoading) return <Loading />;
  if (error || !t) return <ErrorBox error={error ?? new Error('Not found')} />;
  /** applying needs a real browser: only a coding agent session can run it, so auto-route / LLM retries cannot help */
  const browserOnly = t.type === 'job_application';
  const act = async (key: string, path: string, body?: unknown, ok?: string) => {
    setIssues([]);
    const r = await run(key, () => api(path, { method: 'POST', body }), ok);
    mutate(); refresh('/tasks', '/dashboard', '/courses');
    return r;
  };
  const importOutput = async (output: unknown) => {
    setIssues([]);
    try {
      await api(`/tasks/${id}/import`, { body: { output } });
      mutate(); refresh('/tasks', '/courses');
    } catch (e) {
      const b = (e as { body?: { issues?: string[]; message?: string } }).body;
      setIssues(b?.issues ?? [b?.message ?? (e as Error).message]);
    }
  };
  const canHandoff = !['running', 'completed', 'cancelled'].includes(t.state);
  const link = t.courseId ? `/courses/${t.courseId}` : t.roundId ? `/rounds/${t.roundId}` : t.applicationId ? `/applications/${t.applicationId}` : null;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/tasks', label: 'Task queue' }} title={t.title} description={<span className="flex flex-wrap items-center gap-2"><StateBadge value={t.state} /><Badge>{t.type.replace(/_/g, ' ')}</Badge><Badge>{t.executionMethod.replace('_', ' ')}</Badge>{link && <Link className="text-accent underline" href={link}>Open related record</Link>}</span>} />
      <Card className="p-4 text-sm">
        <p>{STATE_HELP[t.state]}</p>
        {t.routingReason && <p className="mt-1 text-xs text-muted">Routing: {t.routingReason}</p>}
        {t.lastError && <p className="mt-1 text-xs text-danger">Last error: {t.lastError}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {['failed', 'retry_wait', 'ready_for_agent', 'submitted', 'awaiting_review'].includes(t.state) && !(browserOnly && t.state === 'ready_for_agent') && <Button variant="outline" loading={busy === 'retry'} onClick={() => act('retry', `/tasks/${id}/retry`, {}, 'Re-routed')}><RefreshCw className="h-3.5 w-3.5" />Retry (auto-route)</Button>}
          {['failed', 'retry_wait', 'ready_for_agent', 'submitted'].includes(t.state) && !browserOnly && <Button variant="outline" loading={busy === 'llm'} onClick={() => act('llm', `/tasks/${id}/retry`, { method: 'llm' }, 'Queued for the LLM endpoint')}>Run with LLM endpoint</Button>}
          {t.state === 'awaiting_review' && <><Button loading={busy === 'approve'} onClick={() => act('approve', `/tasks/${id}/approve`, undefined, 'Approved')}><Check className="h-3.5 w-3.5" />Approve result</Button><Button variant="outline" onClick={() => act('reject', `/tasks/${id}/reject`, { reason: 'Rejected in review' }, 'Sent back to the agent')}><X className="h-3.5 w-3.5" />Reject</Button></>}
          {!['completed', 'cancelled'].includes(t.state) && <Button variant="ghost" className="text-danger" onClick={() => act('cancel', `/tasks/${id}/cancel`, undefined, 'Cancelled')}>Cancel task</Button>}
        </div>
      </Card>

      {canHandoff && (
        <Card>
          <CardHeader title="Run with a coding agent (Claude Code, Cursor, Antigravity)" description="Uses your existing subscription through the agent's own app — no API key needed." />
          <ol className="list-decimal space-y-3 p-4 pl-9 text-sm">
            <li>
              <Button size="sm" loading={busy === 'handoff'} onClick={async () => { const r = await act('handoff', `/tasks/${id}/handoff`, undefined, 'Task package written') as { packageDir: string } | undefined; if (r) setPkgDir(r.packageDir); }}><FolderOpen className="h-3.5 w-3.5" />Export task package</Button>
              {' '}<a className="text-xs text-accent underline" href={`/api/tasks/${id}/package`} download={`task-${id}.json`}><Download className="inline h-3 w-3" /> download task.json</a>
              {pkgDir && <p className="mt-1 break-all font-mono text-xs text-muted">{pkgDir}</p>}
            </li>
            <li>Open the <code className="rounded bg-surface-2 px-1">agent-workspace</code> folder in your agent and run: <code className="block mt-1 rounded bg-surface-2 px-2 py-1 font-mono text-xs">Use the icc skill for tasks/{id} — read TASK.md and write output/result.json</code></li>
            <li className="space-x-2"><Button size="sm" variant="outline" disabled={t.state === 'submitted'} onClick={() => act('submitted', `/tasks/${id}/submitted`, undefined, 'Marked as submitted')}>Mark as submitted</Button><span className="text-xs text-muted">(optional, for tracking)</span></li>
            <li className="space-y-2">
              <Button size="sm" loading={busy === 'sync'} onClick={async () => { setIssues([]); try { await api(`/tasks/${id}/sync`, { method: 'POST' }); mutate(); refresh('/tasks', '/courses'); } catch (e) { const b = (e as { body?: { issues?: string[]; message?: string } }).body; setIssues(b?.issues ?? [b?.message ?? (e as Error).message]); } }}><Upload className="h-3.5 w-3.5" />Sync output from task folder</Button>
              <p className="text-xs text-muted">…or upload / paste result.json:</p>
              <input type="file" accept="application/json,.json" className="block text-xs" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { await importOutput(JSON.parse(await file.text())); } catch { setIssues(['File is not valid JSON']); } }} />
              <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"...": "..."}' className="min-h-24 font-mono text-xs" />
              <Button size="sm" variant="outline" disabled={!paste.trim()} onClick={() => { try { importOutput(JSON.parse(paste)); } catch { setIssues(['Pasted text is not valid JSON']); } }}>Import pasted JSON</Button>
            </li>
          </ol>
          {issues.length > 0 && <div className="mx-4 mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-xs text-danger"><p className="font-medium">Output rejected — nothing was imported</p><ul className="mt-1 list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul></div>}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Timeline" />
          <dl className="grid grid-cols-2 gap-2 p-4 text-xs">
            <dt className="text-muted">Created</dt><dd>{fmtDate(t.createdAt, true)}</dd>
            <dt className="text-muted">Scheduled for</dt><dd>{fmtDate(t.scheduledFor, true)} ({relTime(t.scheduledFor)})</dd>
            <dt className="text-muted">Attempts</dt><dd>{t.attempts} / {t.maxAttempts}</dd>
            {t.nextRetryAt && <><dt className="text-muted">Next retry</dt><dd>{relTime(t.nextRetryAt)}</dd></>}
            {t.completedAt && <><dt className="text-muted">Completed</dt><dd>{fmtDate(t.completedAt, true)}</dd></>}
            {t.outputRef && <><dt className="text-muted">Output</dt><dd className="font-mono">{JSON.stringify(t.outputRef)}</dd></>}
            {t.validation && <><dt className="text-muted">Validation</dt><dd>{t.validation.ok ? 'passed' : `failed: ${t.validation.issues?.slice(0, 3).join('; ')}`}</dd></>}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Attempt history" />
          <ul className="divide-y divide-border">
            {t.history?.map((h) => <li key={h.id} className="px-4 py-2 text-xs"><div className="flex justify-between"><span>#{h.attemptNo} · {h.method}</span><StateBadge value={h.status === 'succeeded' || h.status === 'imported' ? 'completed' : h.status} /></div><p className="text-muted">{fmtDate(h.startedAt, true)}</p>{h.error && <p className="text-danger">{h.error}</p>}</li>)}
            {!t.history?.length && <li className="px-4 py-3 text-xs text-muted">No attempts yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
