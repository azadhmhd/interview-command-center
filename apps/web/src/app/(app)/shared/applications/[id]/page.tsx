'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, Input, Loading, Markdown, PageHeader, StateBadge, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, label } from '@/lib/utils';

interface Shared {
  permission: string;
  application: {
    companyName: string; jobTitle: string; status: string; jobDescription?: string;
    rounds: { id: string; sequence: number; type: string; title?: string; scheduledAt?: string; outcome: string; feedback?: string; occurrences: { id: string; source: string; prompt: string; originalAnswer?: string; approvedAnswer?: string; mistakes?: string }[] }[];
    activities: { id: string; message: string; createdAt: string }[];
  };
}

export default function SharedApplication() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useApi<Shared>(`/shared/applications/${id}`);
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Not found')} />;
  const a = data.application;
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/shared', label: 'Shared with me' }} title={`${a.companyName} — ${a.jobTitle}`} description={<span className="flex gap-2"><StateBadge value={a.status} /><Badge>{data.permission.toLowerCase()} access</Badge></span>} />
      {a.rounds.map((r) => (
        <Card key={r.id}>
          <CardHeader title={`${r.sequence}. ${r.title || label(r.type)}`} description={`${fmtDate(r.scheduledAt)} · ${r.outcome}`} />
          <ul className="divide-y divide-border">
            {r.occurrences.map((o) => <li key={o.id} className="space-y-1 px-4 py-3 text-sm"><p className="font-medium">{o.prompt} <StateBadge value={o.source} /></p>{o.originalAnswer && <Markdown className="text-muted">{o.originalAnswer}</Markdown>}{o.mistakes && <p className="text-xs text-warning">Mistakes: {o.mistakes}</p>}</li>)}
            {!r.occurrences.length && <li className="px-4 py-3 text-xs text-muted">No questions recorded.</li>}
          </ul>
          {r.feedback && <p className="border-t border-border px-4 py-2 text-xs">Feedback: {r.feedback}</p>}
        </Card>
      ))}
      <Card>
        <CardHeader title="Notes" />
        {data.permission === 'EDIT' && <form className="flex gap-2 border-b border-border p-3" onSubmit={async (e) => { e.preventDefault(); if (await run('n', () => api(`/shared/applications/${id}/notes`, { body: { message: note } }), 'Note added')) { setNote(''); mutate(); } }}><Input aria-label="Note" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave feedback for the owner…" /><Button type="submit" loading={busy === 'n'}>Add</Button></form>}
        <ul className="divide-y divide-border">{a.activities.map((x) => <li key={x.id} className="px-4 py-2 text-sm">{x.message}<p className="text-xs text-muted">{fmtDate(x.createdAt, true)}</p></li>)}</ul>
      </Card>
    </div>
  );
}
