'use client';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Dialog, Select, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { DraftSummary } from '@/lib/resume';
import { relTime } from '@/lib/utils';

/** "Resumes for this job" card on an application or job lead: list its tailored copies and make a new one. */
export function JobResumes({ applicationId, jobLeadId }: { applicationId?: string; jobLeadId?: string }) {
  const router = useRouter();
  const q = applicationId ? `applicationId=${applicationId}` : `jobLeadId=${jobLeadId}`;
  const { data: copies } = useApi<DraftSummary[]>(`/resume-drafts?${q}`);
  const { data: all } = useApi<DraftSummary[]>('/resume-drafts');
  const masters = (all ?? []).filter((d) => !d.applicationId && !d.jobLeadId);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [ai, setAi] = useState(true);
  const { busy, run } = useAction();
  return (
    <Card>
      <CardHeader title="Resumes for this job" action={<Button size="sm" variant="outline" onClick={() => { setFrom(masters[0]?.id ?? ''); setOpen(true); }}><Plus className="h-3.5 w-3.5" />Tailor</Button>} />
      <ul className="divide-y divide-border">
        {copies?.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
            <Link href={`/resumes/${d.id}`} className="min-w-0 truncate hover:underline"><FileText className="mr-1 inline h-3.5 w-3.5" />{d.title}</Link>
            <span className="shrink-0 text-xs text-muted">{d.publishedResumeId ? <Badge tone="success">published</Badge> : relTime(d.updatedAt)}</span>
          </li>
        ))}
        {!copies?.length && <li className="px-4 py-3 text-xs text-muted">No tailored resume yet. Publish one to attach it to this job.</li>}
      </ul>
      <Dialog open={open} onClose={() => setOpen(false)} title="Tailored resume for this job">
        {!masters.length ? <p className="text-sm">Create a resume in the <Link href="/resumes" className="text-accent underline">Resume builder</Link> first.</p> : (
          <div className="space-y-3 text-sm">
            <Select aria-label="Start from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {masters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </Select>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={ai} onChange={(e) => setAi(e.target.checked)} />
              <span>Tailor the wording to this job with AI<span className="block text-xs text-muted">Only reorders and rewords what is already in the resume. Same theme as the original.</span></span></label>
            <div className="flex justify-end">
              <Button disabled={!from} loading={busy === 'go'} onClick={async () => {
                const body = applicationId ? { applicationId } : { jobLeadId };
                const r = await run('go', () => (ai ? api<{ draft: DraftSummary }>(`/resume-drafts/${from}/tailor`, { body }) : api<DraftSummary>(`/resume-drafts/${from}/duplicate`, { body }).then((draft) => ({ draft }))), 'Copy created');
                if (r) router.push(`/resumes/${r.draft.id}`);
              }}>Create</Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
