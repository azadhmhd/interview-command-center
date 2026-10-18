'use client';
import { Download, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AutoApplyNav } from '@/components/auto-apply-bits';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Textarea, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';

interface Recruiter { id: string; name?: string; email?: string; phone?: string; company?: string; title?: string; linkedinUrl?: string; source: string; notes?: string; lastContactedAt?: string; lead?: { id: string; title: string; company: string; status: string } | null }

function Recruiters() {
  const leadId = useSearchParams().get('leadId') ?? undefined;
  const [q, setQ] = useState('');
  const { data, error, isLoading, mutate } = useApi<Recruiter[]>(`/autoapply/recruiters${q ? `?q=${encodeURIComponent(q)}` : ''}`, { keepPreviousData: true });
  const [f, setF] = useState({ name: '', email: '', company: '', title: '', linkedinUrl: '' });
  const [paste, setPaste] = useState('');
  const { busy, run } = useAction();
  return (
    <div className="space-y-4">
      <PageHeader title="Recruiters" description="Contacts saved from job posts, alert emails and your notes, kept for outreach later. Nothing is emailed from here."
        actions={<a href="/api/autoapply/recruiters/export.csv" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-surface-2"><Download className="h-4 w-4" />Export CSV</a>} />
      <AutoApplyNav />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add a contact" description={leadId ? 'Will be linked to the job you came from.' : undefined} />
          <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const body = Object.fromEntries(Object.entries({ ...f, leadId }).filter(([, v]) => v)); if (await run('add', () => api('/autoapply/recruiters', { body }), 'Contact saved')) { setF({ name: '', email: '', company: '', title: '', linkedinUrl: '' }); mutate(); } }}>
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Talent Acquisition Partner" /></Field>
            <Field label="LinkedIn URL" className="sm:col-span-2"><Input type="url" value={f.linkedinUrl} onChange={(e) => setF({ ...f, linkedinUrl: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" loading={busy === 'add'}>Save contact</Button></div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Extract from text" description="Paste a recruiter email, signature or LinkedIn message; emails, phone and LinkedIn URL are pulled out locally." />
          <form className="space-y-3 p-4" onSubmit={async (e) => { e.preventDefault(); const r = await run('ex', () => api<{ saved: unknown[] }>('/autoapply/recruiters/extract', { body: { text: paste, leadId } })); if (r) { setPaste(''); mutate(); } }}>
            <Textarea required value={paste} onChange={(e) => setPaste(e.target.value)} className="min-h-36 text-xs" placeholder={'From: "Dana Lee" <dana@company.com>\nHi Sam, …'} />
            <Button type="submit" variant="outline" loading={busy === 'ex'}>Extract & save</Button>
          </form>
        </Card>
      </div>
      <Card>
        <CardHeader title={`Contacts (${data?.length ?? 0})`} action={<Input aria-label="Search contacts" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />} />
        <ErrorBox error={error} />
        {isLoading && !data ? <Loading /> : !data?.length ? <EmptyState icon={<Users className="h-6 w-6" />} title="No recruiters yet" description="Emails found in job descriptions are saved automatically." /> : (
          <ul className="divide-y divide-border">
            {data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name ?? r.email ?? 'Unnamed'} {r.title && <span className="text-xs font-normal text-muted">· {r.title}</span>} <Badge>{r.source.replace('_', ' ')}</Badge></p>
                  <p className="text-xs text-muted">{[r.email, r.phone, r.company].filter(Boolean).join(' · ')}{r.linkedinUrl && <> · <a className="text-accent underline" href={r.linkedinUrl} target="_blank" rel="noreferrer noopener">LinkedIn</a></>}</p>
                  {r.lead && <p className="text-xs">Job: <Link className="text-accent hover:underline" href={`/auto-apply/leads/${r.lead.id}`}>{r.lead.title} @ {r.lead.company}</Link></p>}
                </div>
                <Button size="sm" variant="ghost" onClick={async () => { await run('c', () => api(`/autoapply/recruiters/${r.id}`, { method: 'PATCH', body: { lastContactedAt: new Date().toISOString() } }), 'Marked as contacted'); mutate(); }}>{r.lastContactedAt ? `Contacted ${fmtDate(r.lastContactedAt)}` : 'Mark contacted'}</Button>
                <Button size="icon" variant="ghost" aria-label="Delete contact" onClick={async () => { if (confirm('Delete this contact?')) { await run('d', () => api(`/autoapply/recruiters/${r.id}`, { method: 'DELETE' })); mutate(); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense><Recruiters /></Suspense>;
}
