'use client';
import { Play, Rocket, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AutoApplyNav } from '@/components/auto-apply-bits';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { fmtDate, relTime } from '@/lib/utils';

interface Source { id: string; type: string; name: string; config: { board?: string; company?: string; hasKey?: boolean }; enabled: boolean; lastRunAt?: string; lastSuccessAt?: string; lastError?: string; lastFoundCount: number; _count: { leads: number } }

const TYPES = [
  { value: 'GREENHOUSE', label: 'Greenhouse', hint: 'board token from job-boards.greenhouse.io/<board>' },
  { value: 'LEVER', label: 'Lever', hint: 'company from jobs.lever.co/<company>' },
  { value: 'ASHBY', label: 'Ashby', hint: 'board from jobs.ashbyhq.com/<board>' },
  { value: 'SMARTRECRUITERS', label: 'SmartRecruiters', hint: 'company id from jobs.smartrecruiters.com/<Company>' },
  { value: 'WORKABLE', label: 'Workable', hint: 'account from apply.workable.com/<account>' },
];
const SEARCH = ['GOOGLE_JOBS', 'JOOBLE'];

export default function Sources() {
  const { data, error, isLoading, mutate } = useApi<Source[]>('/autoapply/sources');
  const [f, setF] = useState({ type: 'GREENHOUSE', name: '', board: '', company: '' });
  const { busy, run } = useAction();
  const reload = () => { mutate(); refresh('/autoapply'); };
  const hint = TYPES.find((t) => t.value === f.type)?.hint;
  return (
    <div className="space-y-4">
      <PageHeader title="Job sources" description="Role searches and watched company boards. The worker runs them on schedule and queues the matches automatically." />
      <AutoApplyNav />
      <Card className="p-4 text-sm">
        <p><strong>Jobs are found by role.</strong> Google Jobs and Jooble search your target titles in your locations across LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf and company pages. Set keys, sites and locations in <Link className="underline" href="/auto-apply/settings">Settings → Where to search</Link>.</p>
        <p className="mt-1 text-xs text-muted">Company boards below are optional: add employers you want every opening from, even ones the search would miss.</p>
      </Card>
      <Card>
        <CardHeader title="Watch a company board" description="Find the board name in the company's careers link." />
        <form className="grid gap-3 p-4 sm:grid-cols-[160px_1fr_1fr_1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); if (await run('add', () => api('/autoapply/sources', { body: { type: f.type, name: f.name || f.company || f.board, config: { board: f.board.trim(), ...(f.company && { company: f.company }) } } }), 'Source added')) { setF({ ...f, name: '', board: '', company: '' }); reload(); } }}>
          <Field label="Platform"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
          <Field label="Board / company slug" hint={hint}><Input required value={f.board} onChange={(e) => setF({ ...f, board: e.target.value })} placeholder="acme" /></Field>
          <Field label="Company name (display)"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Acme" /></Field>
          <Field label="Source name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="defaults to company" /></Field>
          <Button type="submit" loading={busy === 'add'}>Add</Button>
        </form>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={<Rocket className="h-6 w-6" />} title="No sources yet" description="Add the companies you want to work for. Each scan pulls their open roles, scores them and prepares apply kits for the good ones." /></Card> : (
        <Card>
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name} <Badge>{SEARCH.includes(s.type) ? 'role search' : TYPES.find((t) => t.value === s.type)?.label ?? s.type}</Badge> {!s.enabled && <Badge>paused</Badge>}</p>
                  <p className="text-xs text-muted">{s.config.board ? `board “${s.config.board}”` : 'your titles × locations'} · {s._count.leads} jobs · last scan {s.lastRunAt ? relTime(s.lastRunAt) : 'never'}{s.lastSuccessAt && ` · last success ${fmtDate(s.lastSuccessAt, true)} (${s.lastFoundCount} open roles)`}</p>
                  {s.lastError && <p className="text-xs text-danger">Last error: {s.lastError}</p>}
                </div>
                <Button size="sm" variant="outline" loading={busy === s.id} onClick={async () => { const r = await run(s.id, () => api<{ found: number; created: number; error?: string }>(`/autoapply/sources/${s.id}/run`, { method: 'POST' })); if (r) { reload(); } }}><Play className="h-3.5 w-3.5" />Scan now</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await run('t', () => api(`/autoapply/sources/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } })); reload(); }}>{s.enabled ? 'Pause' : 'Resume'}</Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} onClick={async () => { if (confirm(`Remove ${s.name}? Jobs already found stay.`)) { await run('d', () => api(`/autoapply/sources/${s.id}`, { method: 'DELETE' })); reload(); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
