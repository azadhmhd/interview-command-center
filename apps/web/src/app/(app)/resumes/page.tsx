'use client';
import { Copy, FilePlus2, FileText, FileUp, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorBox, Loading, PageHeader, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { DraftSummary } from '@/lib/resume';
import { relTime } from '@/lib/utils';

interface Cv { id: string; label: string; version: number; fileName: string; createdAt: string }

function Rows({ items, onChange }: { items: DraftSummary[]; onChange: () => void }) {
  const router = useRouter();
  const { busy, run } = useAction();
  if (!items.length) return <p className="px-4 py-3 text-xs text-muted">None yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <Link href={`/resumes/${d.id}`} className="min-w-0 flex-1">
            <p className="truncate font-medium hover:underline">{d.title}</p>
            <p className="truncate text-xs text-muted">
              {d.application ? <>Application · {d.application.companyName} – {d.application.jobTitle} · </> : d.jobLead ? <>Job lead · {d.jobLead.company} – {d.jobLead.title} · </> : null}
              edited {relTime(d.updatedAt)}
            </p>
          </Link>
          {d.publishedResumeId && <Badge tone="success">published</Badge>}
          <Button size="sm" variant="ghost" aria-label={`Duplicate ${d.title}`} loading={busy === `c${d.id}`} onClick={async () => {
            const copy = await run(`c${d.id}`, () => api<DraftSummary>(`/resume-drafts/${d.id}/duplicate`, { body: {} }), 'Copy created');
            if (copy) router.push(`/resumes/${copy.id}`);
          }}><Copy className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" aria-label={`Delete ${d.title}`} loading={busy === `d${d.id}`} onClick={async () => {
            if (!confirm(`Delete "${d.title}"? Published PDFs stay in Profile & CVs.`)) return;
            if (await run(`d${d.id}`, () => api(`/resume-drafts/${d.id}`, { method: 'DELETE' }), 'Deleted')) onChange();
          }}><Trash2 className="h-4 w-4" /></Button>
        </li>
      ))}
    </ul>
  );
}

export default function ResumesPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useApi<DraftSummary[]>('/resume-drafts');
  const { data: cvs } = useApi<Cv[]>('/resumes');
  const [importing, setImporting] = useState(false);
  const { busy, run } = useAction();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const create = async (from: 'profile' | 'blank') => {
    const d = await run(from, () => api<DraftSummary>('/resume-drafts', { body: { from, title: from === 'blank' ? 'New resume' : 'Main resume' } }));
    if (d) router.push(`/resumes/${d.id}`);
  };
  const mine = data.filter((d) => !d.applicationId && !d.jobLeadId);
  const tailored = data.filter((d) => d.applicationId || d.jobLeadId);

  return (
    <div className="space-y-4">
      <PageHeader title="Resume builder" description="Design once, then make a matching copy for every job. Copies keep the same theme; there is no limit."
        actions={<>
          <Button variant="secondary" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import a CV</Button>
          <Button variant="secondary" loading={busy === 'blank'} onClick={() => create('blank')}><FilePlus2 className="h-4 w-4" />Blank</Button>
          <Button loading={busy === 'profile'} onClick={() => create('profile')}><FileText className="h-4 w-4" />New from profile</Button>
        </>} />
      {!data.length ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No resumes yet"
          description="Start from your profile and confirmed CV facts, import an uploaded CV with AI, or start blank." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="Your resumes" description="Masters and free copies" /><Rows items={mine} onChange={mutate} /></Card>
          <Card><CardHeader title="Tailored for jobs" description="Linked to an application or a job lead; published copies are attached when you apply" /><Rows items={tailored} onChange={mutate} /></Card>
        </div>
      )}
      <Dialog open={importing} onClose={() => setImporting(false)} title="Import an uploaded CV">
        <p className="mb-3 text-sm text-muted">AI copies your CV word for word into the builder (no rewriting). It runs as a task; the new resume appears here when it is done.</p>
        {!cvs?.length ? <p className="text-sm">Upload a CV in <Link className="text-accent underline" href="/settings/profile">Profile &amp; CVs</Link> first.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {cvs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{c.label} v{c.version} <span className="text-xs text-muted">· {c.fileName}</span></span>
                <Button size="sm" loading={busy === `i${c.id}`} onClick={async () => {
                  if (await run(`i${c.id}`, () => api('/resume-drafts/import', { body: { resumeId: c.id } }), 'Import started. Check the task queue.')) setImporting(false);
                }}>Import</Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}
