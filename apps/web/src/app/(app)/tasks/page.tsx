'use client';
import { Bot } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Loading, PageHeader, StateBadge, Tabs } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { Task } from '@/lib/types';
import { relTime } from '@/lib/utils';

const FILTERS = {
  attention: 'ready_for_agent,submitted,awaiting_review,failed',
  active: 'scheduled,queued,running,retry_wait',
  done: 'completed,cancelled',
  all: '',
};
type F = keyof typeof FILTERS;

interface AgentStatus {
  llm: { available: boolean; reason?: string; source: string };
  manual: { available: boolean; workspaceDir: string; note: string };
  claudeCli: { enabled: boolean; found: boolean; version?: string; path: string };
  cursor: { unattended: boolean; note: string };
  antigravity: { unattended: boolean; note: string };
}

export default function Tasks() {
  const [f, setF] = useState<F>('attention');
  const { data, error, isLoading } = useApi<Task[]>(`/tasks${FILTERS[f] ? `?state=${FILTERS[f]}` : ''}`, { refreshInterval: 5000 });
  const { data: st } = useApi<AgentStatus>('/agents/status');
  return (
    <div className="space-y-4">
      <PageHeader title="Agent task queue" description="AI work routed to your LLM endpoint, a coding agent, or waiting for you. Deterministic scheduling never waits on AI."
        actions={<Tabs<F> value={f} onChange={setF} items={[{ value: 'attention', label: 'Needs attention' }, { value: 'active', label: 'Scheduled & running' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />} />
      {st && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="p-3 text-sm"><p className="text-xs text-muted">LLM endpoint</p><p className="font-medium">{st.llm.available ? <span className="text-success">Available</span> : <span className="text-warning">Unavailable</span>}</p><p className="text-xs text-muted">{st.llm.reason ?? `source: ${st.llm.source}`}</p></Card>
          <Card className="p-3 text-sm"><p className="text-xs text-muted">Manual agent handoff</p><p className="font-medium text-success">Always available</p><p className="truncate text-xs text-muted" title={st.manual.workspaceDir}>{st.manual.workspaceDir}</p></Card>
          <Card className="p-3 text-sm"><p className="text-xs text-muted">Claude Code headless</p><p className="font-medium">{st.claudeCli.enabled ? (st.claudeCli.found ? <span className="text-success">Enabled</span> : <span className="text-danger">Enabled, CLI not found</span>) : 'Off (opt-in)'}</p><p className="text-xs text-muted">{st.claudeCli.found ? st.claudeCli.version : 'Set AGENT_CLAUDE_CLI_ENABLED=true on the worker host'}</p></Card>
          <Card className="p-3 text-sm"><p className="text-xs text-muted">Cursor / Antigravity</p><p className="font-medium">Manual handoff</p><p className="text-xs text-muted">No verified unattended integration</p></Card>
        </div>
      )}
      <ErrorBox error={error} />
      <Card>
        <CardHeader title="Tasks" />
        {isLoading ? <Loading /> : !data?.length ? <EmptyState icon={<Bot className="h-6 w-6" />} title="Nothing here" /> : (
          <ul className="divide-y divide-border">
            {data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${t.id}`} className="text-sm font-medium hover:underline">{t.title}</Link>
                  <p className="truncate text-xs text-muted">{t.type.replace(/_/g, ' ')} · {t.state === 'scheduled' ? `runs ${relTime(t.scheduledFor)}` : t.state === 'retry_wait' ? `retry ${relTime(t.nextRetryAt)}` : t.routingReason}</p>
                  {t.lastError && <p className="truncate text-xs text-danger">{t.lastError}</p>}
                </div>
                <Badge>{t.executionMethod.replace('_', ' ')}</Badge>
                <span className="text-xs tabular-nums text-muted">{t.attempts}/{t.maxAttempts}</span>
                <StateBadge value={t.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
