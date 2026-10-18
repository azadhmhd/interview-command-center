'use client';
import { motion } from 'framer-motion';
import { Briefcase, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ApplicationForm } from '@/components/application-form';
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, Loading, PageHeader, Select, StateBadge, Tabs, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { useRoundLabel, useSettings } from '@/lib/hooks';
import type { Application } from '@/lib/types';
import { fmtDate, relTime } from '@/lib/utils';

type View = 'table' | 'kanban' | 'timeline';
const VIEW_KEY = 'icc.apps.view';
const prioTone = { HIGH: 'danger', MEDIUM: 'neutral', LOW: 'neutral' } as const;

function Applications() {
  const params = useSearchParams();
  const router = useRouter();
  const { settings } = useSettings();
  const roundLabel = useRoundLabel();
  const [view, setView] = useState<View>('table');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [roundType, setRoundType] = useState('');
  const [prep, setPrep] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const { run } = useAction();
  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY) as View; if (v) setView(v); } catch { /* ignore */ } }, []);
  const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(priority && { priority }), ...(roundType && { roundType }), ...(prep && { prep }), ...(archived && { archived: 'true' }) }).toString();
  const { data, error, isLoading } = useApi<Application[]>(`/applications${qs ? `?${qs}` : ''}`);

  const byStatus = useMemo(() => Object.fromEntries((settings?.statuses ?? []).map((s) => [s, (data ?? []).filter((a) => a.status === s)])), [data, settings]);
  const move = async (id: string, to: string) => { await run(id, () => api(`/applications/${id}`, { method: 'PATCH', body: { status: to } }), `Moved to ${to}`); refresh('/applications', '/dashboard'); };

  return (
    <div>
      <PageHeader title="Applications" description="Every application, its interview sequence and next step."
        actions={<><Tabs<View> value={view} onChange={(v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } }} items={[{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }, { value: 'timeline', label: 'Timeline' }]} />
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New</Button></>} />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input aria-label="Search" placeholder="Search company, role, location" value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{settings?.statuses.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any priority</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></Select>
        <Select aria-label="Interview type" value={roundType} onChange={(e) => setRoundType(e.target.value)}><option value="">Any interview type</option>{settings?.roundTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        <div className="flex gap-2">
          <Select aria-label="Preparation" value={prep} onChange={(e) => setPrep(e.target.value)}><option value="">Any prep state</option><option value="with_course">Has a course</option><option value="no_course">Upcoming, no course</option></Select>
          <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archived</label>
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? (
        <Card><EmptyState icon={<Briefcase className="h-6 w-6" />} title={qs ? 'No applications match these filters' : 'No applications yet'} description="Track each application, its custom interview sequence and outcomes." action={<Button onClick={() => setCreating(true)}>Add your first application</Button>} /></Card>
      ) : view === 'table' ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Company / role</th><th className="font-medium">Status</th><th className="font-medium">Priority</th><th className="font-medium">Rounds</th><th className="font-medium">Next interview</th><th className="font-medium">Next action</th><th className="pr-4 font-medium">Updated</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/applications/${a.id}`)}>
                  <td className="px-4 py-2.5"><Link href={`/applications/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{a.companyName}</Link><p className="text-xs text-muted">{a.jobTitle}{a.location && ` · ${a.location}`}</p></td>
                  <td><StateBadge value={a.status} /></td>
                  <td><Badge tone={prioTone[a.priority]}>{a.priority.toLowerCase()}</Badge></td>
                  <td className="text-xs text-muted">{a.rounds.map((r) => <span key={r.id} title={`${roundLabel(r.type)} · ${r.status}`} className={`mr-0.5 inline-block h-2 w-2 rounded-full ${r.outcome === 'passed' ? 'bg-success' : r.outcome === 'failed' ? 'bg-danger' : r.status === 'scheduled' ? 'bg-accent' : 'bg-border'}`} />)}{!a.rounds.length && '—'}</td>
                  <td className="text-xs">{a.nextRound ? <>{roundLabel(a.nextRound.type)}<br /><span className="text-muted">{relTime(a.nextRound.scheduledAt)}</span></> : '—'}</td>
                  <td className="max-w-48 truncate text-xs">{a.nextAction ?? '—'}</td>
                  <td className="pr-4 text-xs text-muted">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {settings?.statuses.filter((s) => !status || s === status).map((s) => (
            <div key={s} className="w-64 shrink-0" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) move(id, s); }}>
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-muted">{s}<span>{byStatus[s]?.length ?? 0}</span></p>
              <div className="min-h-24 space-y-2 rounded-lg bg-surface-2 p-2">
                {byStatus[s]?.map((a) => (
                  <motion.div layout key={a.id} draggable onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData('text/plain', a.id)}>
                    <Card className="cursor-grab p-3 active:cursor-grabbing">
                      <Link href={`/applications/${a.id}`} className="text-sm font-medium hover:underline">{a.companyName}</Link>
                      <p className="text-xs text-muted">{a.jobTitle}</p>
                      {a.nextRound && <p className="mt-1 text-xs text-accent">{roundLabel(a.nextRound.type)} {relTime(a.nextRound.scheduledAt)}</p>}
                      <Select aria-label={`Move ${a.companyName}`} className="mt-2 h-7 text-xs" value={a.status} onChange={(e) => move(a.id, e.target.value)}>{settings?.statuses.map((x) => <option key={x}>{x}</option>)}</Select>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="p-4">
          <ol className="relative border-l border-border pl-5">
            {[...data].sort((a, b) => new Date(b.appliedAt ?? b.createdAt).getTime() - new Date(a.appliedAt ?? a.createdAt).getTime()).map((a) => (
              <li key={a.id} className="mb-5">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" />
                <p className="text-xs text-muted">{fmtDate(a.appliedAt ?? a.createdAt)}</p>
                <Link href={`/applications/${a.id}`} className="text-sm font-medium hover:underline">{a.companyName} — {a.jobTitle}</Link> <StateBadge value={a.status} />
                <div className="mt-1 flex flex-wrap gap-1">{a.rounds.map((r) => <Badge key={r.id} tone={r.outcome === 'passed' ? 'success' : r.outcome === 'failed' ? 'danger' : 'neutral'}>{r.sequence}. {roundLabel(r.type)}{r.scheduledAt && ` · ${fmtDate(r.scheduledAt)}`}</Badge>)}</div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="New application" wide>
        <ApplicationForm onDone={(a) => { setCreating(false); router.push(`/applications/${a.id}`); }} />
      </Dialog>
    </div>
  );
}

export default function Page() {
  return <Suspense><Applications /></Suspense>;
}
