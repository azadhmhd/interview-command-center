'use client';
import { FileUp, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, Field, Input, Loading, PageHeader, Textarea, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';

interface Profile { fullName?: string; headline?: string; location?: string; yearsExperience?: number; targetRoles: string[]; secondaryRoles: string[]; workBalance?: string; coreTech: string[]; aiInterests: string[]; noticePeriodDays?: number; salaryTarget?: number; salaryCurrency: string; summary?: string; confirmedFacts?: Record<string, unknown> | null }
interface Resume { id: string; label: string; version: number; fileName: string; sizeBytes: number; isDefault: boolean; structuredStatus: string; createdAt: string }
interface ResumeDetail extends Resume { extractedText?: string; structured?: Record<string, unknown> | null; detectedTech: string[] }

const arr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function ResumeView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, mutate } = useApi<ResumeDetail>(`/resumes/${id}`);
  const [json, setJson] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (data?.structured) setJson(JSON.stringify(data.structured, null, 2)); }, [data]);
  return (
    <Dialog open onClose={onClose} title={data ? `${data.label} v${data.version}` : 'CV'} wide>
      {!data ? <Loading /> : (
        <div className="space-y-4 text-sm">
          <div><p className="text-xs font-medium text-muted">Detected technologies (keyword match, no AI)</p><div className="mt-1 flex flex-wrap gap-1">{data.detectedTech.map((t) => <Badge key={t}>{t}</Badge>)}</div></div>
          <div>
            <p className="text-xs font-medium text-muted">Structured data — <Badge tone={data.structuredStatus === 'confirmed' ? 'success' : data.structuredStatus === 'ai_inferred' ? 'warning' : 'neutral'}>{data.structuredStatus === 'ai_inferred' ? 'AI-inferred, needs your review' : data.structuredStatus}</Badge></p>
            {data.structuredStatus === 'none' ? <p className="mt-1 text-xs text-muted">Extraction runs as an AI task (LLM or coding agent). See the <Link className="text-accent underline" href="/tasks">task queue</Link>.</p> : (
              <>
                <Textarea value={json} onChange={(e) => setJson(e.target.value)} className="mt-1 min-h-60 font-mono text-xs" />
                <p className="mt-1 text-xs text-muted">Correct anything wrong, then confirm. Only confirmed facts are treated as true about you.</p>
                <Button size="sm" className="mt-2" loading={busy === 'c'} onClick={async () => { try { const structured = JSON.parse(json); if (await run('c', () => api(`/resumes/${id}/confirm`, { body: { structured } }), 'Facts confirmed')) mutate(); } catch { alert('Invalid JSON'); } }}>Confirm these facts</Button>
              </>
            )}
          </div>
          <details><summary className="cursor-pointer text-xs font-medium text-accent">Extracted text</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs">{data.extractedText}</pre></details>
          <a className="text-xs text-accent underline" href={`/api/resumes/${id}/file`}>Download original</a>
        </div>
      )}
    </Dialog>
  );
}

export default function ProfilePage() {
  const { data: p, error, isLoading, mutate } = useApi<Profile>('/profile');
  const { data: resumes, mutate: mutateResumes } = useApi<Resume[]>('/resumes');
  const [f, setF] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('Main CV');
  const [viewing, setViewing] = useState<string | null>(null);
  const { busy, run } = useAction();
  const fill = (x: Partial<Profile>) => setF({
    fullName: x.fullName ?? '', headline: x.headline ?? '', location: x.location ?? '', yearsExperience: x.yearsExperience?.toString() ?? '',
    targetRoles: x.targetRoles?.join(', ') ?? '', secondaryRoles: x.secondaryRoles?.join(', ') ?? '', workBalance: x.workBalance ?? '', coreTech: x.coreTech?.join(', ') ?? '',
    aiInterests: x.aiInterests?.join(', ') ?? '', noticePeriodDays: x.noticePeriodDays?.toString() ?? '', salaryTarget: x.salaryTarget?.toString() ?? '', salaryCurrency: x.salaryCurrency ?? 'USD', summary: x.summary ?? '',
  });
  useEffect(() => { if (p) fill(p); }, [p]);
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorBox error={error} />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <PageHeader title="Profile & CVs" description="Your CV is the source of truth. AI never invents experience; only facts you confirm are used as facts." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Candidate profile" />
          <form className="space-y-3 p-4" onSubmit={async (e) => {
            e.preventDefault();
            const body = { ...f, yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : null, noticePeriodDays: f.noticePeriodDays ? Number(f.noticePeriodDays) : null, salaryTarget: f.salaryTarget ? Number(f.salaryTarget) : null, targetRoles: arr(f.targetRoles), secondaryRoles: arr(f.secondaryRoles), coreTech: arr(f.coreTech), aiInterests: arr(f.aiInterests) };
            if (await run('save', () => api('/profile', { method: 'PUT', body }), 'Profile saved')) mutate();
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input value={f.fullName ?? ''} onChange={set('fullName')} /></Field>
              <Field label="Headline"><Input value={f.headline ?? ''} onChange={set('headline')} /></Field>
              <Field label="Location"><Input value={f.location ?? ''} onChange={set('location')} /></Field>
              <Field label="Years of experience"><Input type="number" min={0} value={f.yearsExperience ?? ''} onChange={set('yearsExperience')} /></Field>
              <Field label="Primary target roles" hint="Comma separated"><Input value={f.targetRoles ?? ''} onChange={set('targetRoles')} /></Field>
              <Field label="Secondary target roles"><Input value={f.secondaryRoles ?? ''} onChange={set('secondaryRoles')} /></Field>
              <Field label="Core technologies" className="sm:col-span-2"><Input value={f.coreTech ?? ''} onChange={set('coreTech')} /></Field>
              <Field label="AI interests"><Input value={f.aiInterests ?? ''} onChange={set('aiInterests')} /></Field>
              <Field label="Preferred work balance"><Input value={f.workBalance ?? ''} onChange={set('workBalance')} /></Field>
              <Field label="Notice period (days)"><Input type="number" min={0} value={f.noticePeriodDays ?? ''} onChange={set('noticePeriodDays')} /></Field>
              <div className="grid grid-cols-[1fr_80px] gap-2"><Field label="Indicative salary target (monthly)" hint="Override per application"><Input type="number" min={0} value={f.salaryTarget ?? ''} onChange={set('salaryTarget')} /></Field><Field label="Currency"><Input value={f.salaryCurrency ?? ''} onChange={set('salaryCurrency')} /></Field></div>
            </div>
            <Field label="Summary / career narrative"><Textarea value={f.summary ?? ''} onChange={set('summary')} /></Field>
            {p.confirmedFacts && <p className="text-xs text-success">✓ CV facts confirmed — used as ground truth for preparation.</p>}
            <div className="flex justify-end"><Button type="submit" loading={busy === 'save'}>Save profile</Button></div>
          </form>
        </Card>

        <Card>
          <CardHeader title="CV versions" description="PDF, text or Markdown · max 10 MB" />
          <form className="space-y-2 border-b border-border p-3" onSubmit={(e) => e.preventDefault()}>
            <Field label="Label (same label = new version)"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted hover:border-accent"><FileUp className="h-4 w-4" />{busy === 'up' ? 'Uploading…' : 'Choose a CV file'}
              <input type="file" className="sr-only" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const form = new FormData(); form.append('file', file); form.append('label', label);
                if (await run('up', () => api('/resumes', { form }), 'CV uploaded — text extracted')) mutateResumes();
                e.target.value = '';
              }} /></label>
          </form>
          <ul className="divide-y divide-border">
            {resumes?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <button className="min-w-0 text-left" onClick={() => setViewing(r.id)}><p className="truncate font-medium hover:underline">{r.label} v{r.version}</p><p className="text-xs text-muted">{fmtDate(r.createdAt)} · {Math.round(r.sizeBytes / 1024)} KB · {r.structuredStatus.replace('_', ' ')}</p></button>
                {r.isDefault ? <Badge tone="accent"><Star className="h-3 w-3" />default</Badge> : <Button size="sm" variant="ghost" onClick={async () => { await run('d', () => api(`/resumes/${r.id}/default`, { method: 'PATCH' })); mutateResumes(); }}>Make default</Button>}
              </li>
            ))}
            {!resumes?.length && <li className="px-4 py-3 text-xs text-muted">No CV uploaded yet.</li>}
          </ul>
        </Card>
      </div>
      {viewing && <ResumeView id={viewing} onClose={() => { setViewing(null); mutateResumes(); }} />}
    </div>
  );
}
