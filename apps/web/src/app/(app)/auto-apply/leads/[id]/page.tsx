'use client';
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, FileUp, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LeadStatusBadge, ScoreBadge } from '@/components/auto-apply-bits';
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, Field, Input, Loading, PageHeader, Progress, Select, StateBadge, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { ATS_LABEL, KitAnswer, LeadStatus, salary } from '@/lib/autoapply';
import { fmtDate, relTime } from '@/lib/utils';

interface Lead {
  id: string; title: string; company: string; location?: string; remote?: boolean; status: LeadStatus; statusReason?: string; fitScore?: number; fitExplanation?: string;
  fitBreakdown?: Record<string, { score: number; weight: number; reason: string }> & { matchedSkills?: string[]; missingSkills?: string[]; resumeReason?: string };
  blockers: string[]; aiFit?: { score: number; strengths: string[]; gaps: string[]; mandatoryMissing: string[]; explanation: string } | null;
  applyKit?: { coverNote: string; answers: KitAnswer[]; missingRequired: string[]; complete: boolean; questionsFrom?: string } | null; kitStatus: string; autoApproved: boolean;
  description: string; canonicalUrl: string; applyUrl?: string; atsType: string; discoveredVia: string[]; publishedAt?: string; discoveredAt: string; seenCount: number;
  salaryMin?: number; salaryMax?: number; salaryCurrency?: string; salaryPeriod?: string; trackerApplicationId?: string; automatable: boolean; duplicate?: string | null;
  resume?: { id: string; label: string; version: number; fileName: string } | null;
  attempts: { id: string; attemptNo: number; method: string; status: string; error?: string; evidence?: { confirmationUrl?: string; confirmationText?: string; screenshot?: string; note?: string } | null; missingFields: string[]; startedAt: string; finishedAt?: string }[];
  recruiters: { id: string; name?: string; email?: string; title?: string }[];
  tasks: { id: string; type: string; state: string; routingReason?: string }[];
}

const DIMS = ['skills', 'title', 'seniority', 'location', 'salary', 'recency'] as const;
const SRC_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'accent'> = { profile: 'success', standing: 'success', user: 'accent', job: 'info', ai: 'warning', unknown: 'neutral' };

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: l, error, isLoading, mutate } = useApi<Lead>(`/autoapply/leads/${id}`, { refreshInterval: (d?: Lead) => (d?.status === 'APPLYING' ? 5000 : 0) });
  const { data: resumes } = useApi<{ id: string; label: string; version: number }[]>('/resumes');
  const { busy, run } = useAction();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cover, setCover] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [ev, setEv] = useState({ note: '', confirmationUrl: '' });
  useEffect(() => { if (l?.applyKit) { setAnswers(Object.fromEntries(l.applyKit.answers.map((a) => [a.key, a.answer]))); setCover(l.applyKit.coverNote ?? ''); } }, [l]);
  if (isLoading) return <Loading />;
  if (error || !l) return <ErrorBox error={error ?? new Error('Not found')} />;

  const reload = () => { mutate(); refresh('/autoapply'); };
  const status = async (to: LeadStatus, extra: object = {}) => { if (await run(to, () => api(`/autoapply/leads/${id}/status`, { method: 'PATCH', body: { status: to, ...extra } }), `Moved to ${to.replace(/_/g, ' ').toLowerCase()}`)) reload(); };
  const post = async (key: string, path: string, ok: string, body?: object) => { const r = await run(key, () => api(path, { body: body ?? {} }), ok); if (r) reload(); return r; };
  const saveKit = async () => {
    const changed = Object.fromEntries(Object.entries(answers).filter(([k, v]) => l.applyKit?.answers.find((a) => a.key === k)?.answer !== v));
    if (await run('kit', () => api(`/autoapply/leads/${id}/kit`, { method: 'PUT', body: { answers: changed, coverNote: cover !== l.applyKit?.coverNote ? cover : undefined } }), 'Apply kit saved')) reload();
  };
  const can = (...s: LeadStatus[]) => s.includes(l.status);
  const clickedBefore = l.duplicate?.includes('clicked Submit');

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/auto-apply', label: 'Discover jobs' }} title={<span className="flex items-center gap-3"><ScoreBadge score={l.fitScore} />{l.title}</span>}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-medium text-text">{l.company}</span>{l.location}{l.remote && <Badge>Remote</Badge>}<LeadStatusBadge status={l.status} />{l.autoApproved && <Badge tone="info">auto-approved</Badge>}<Badge>{ATS_LABEL[l.atsType] ?? l.atsType}</Badge>{salary(l) && <span>{salary(l)}</span>}</span>}
        actions={<>
          <a href={l.canonicalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-surface-2"><ExternalLink className="h-4 w-4" />Posting</a>
          {l.trackerApplicationId ? <Link href={`/applications/${l.trackerApplicationId}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-surface-2">Open in tracker</Link>
            : <Button variant="outline" loading={busy === 'move'} onClick={async () => { const r = await post('move', `/autoapply/leads/${id}/move-to-tracker`, 'Added to your application tracker') as { applicationId: string } | undefined; if (r) router.push(`/applications/${r.applicationId}`); }}>Move to tracker</Button>}
        </>} />

      {l.statusReason && <Card className="flex items-start gap-2 p-3 text-sm">{l.status === 'NEEDS_ATTENTION' ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-muted" />}<span>{l.statusReason}</span></Card>}
      {l.duplicate && <Card className="flex items-start gap-2 border-warning/40 p-3 text-sm"><ShieldAlert className="h-4 w-4 shrink-0 text-warning" /><div><p className="font-medium">Duplicate protection: {l.duplicate}</p>
        {clickedBefore && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => setSubmitOpen(true)}>It went through: mark submitted</Button><Button size="sm" variant="outline" onClick={() => { if (confirm('You checked the site and this application was NOT submitted? This allows a new attempt.')) status('APPROVED', { verifiedNotSubmitted: true }); }}>I checked: it was not submitted</Button></div>}</div></Card>}

      <Card className="flex flex-wrap items-center gap-2 p-3">
        {can('EVALUATED', 'SKIPPED') && <Button variant="outline" onClick={() => status('SHORTLISTED')}>Shortlist</Button>}
        {can('SHORTLISTED', 'EVALUATED') && <Button variant="outline" loading={busy === 'prep'} onClick={() => post('prep', `/autoapply/leads/${id}/prepare`, 'Apply kit prepared')}>Prepare apply kit</Button>}
        {can('EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW', 'NEEDS_ATTENTION') && !clickedBefore && <Button loading={busy === 'APPROVED'} onClick={() => status('APPROVED')}><Send className="h-4 w-4" />Approve to apply</Button>}
        {can('APPROVED') && <Button variant="outline" onClick={() => status('READY_FOR_REVIEW')}>Unapprove</Button>}
        {can('APPROVED', 'NEEDS_ATTENTION', 'READY_FOR_REVIEW') && <Button variant="outline" loading={busy === 'agent'} onClick={async () => { const t = await post('agent', `/autoapply/leads/${id}/agent-task`, 'Agent task created') as { id: string } | undefined; if (t) router.push(`/tasks/${t.id}`); }}><Bot className="h-4 w-4" />Apply with Claude Code</Button>}
        {can('APPROVED', 'NEEDS_ATTENTION', 'READY_FOR_REVIEW', 'APPLYING') && <Button variant="outline" onClick={() => setSubmitOpen(true)}><CheckCircle2 className="h-4 w-4" />I applied: mark submitted</Button>}
        {can('SUBMITTED') && <><Button variant="outline" onClick={() => status('INTERVIEW')}>Got an interview</Button><Button variant="outline" onClick={() => status('REJECTED')}>Rejected</Button></>}
        {can('SUBMITTED', 'INTERVIEW', 'NEEDS_ATTENTION') && <Button variant="ghost" onClick={() => status('WITHDRAWN')}>Withdraw</Button>}
        {can('DISCOVERED', 'EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW', 'APPROVED', 'NEEDS_ATTENTION') && <Button variant="ghost" onClick={() => status('SKIPPED')}>Skip</Button>}
        <span className="ml-auto flex gap-1">
          {!l.description && <Button size="sm" variant="ghost" loading={busy === 'fetch'} onClick={() => post('fetch', `/autoapply/leads/${id}/fetch-details`, 'Details fetched')}>Fetch details</Button>}
          {can('DISCOVERED', 'EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW', 'SKIPPED') && <Button size="sm" variant="ghost" loading={busy === 'rescore'} onClick={() => post('rescore', `/autoapply/leads/${id}/rescore`, 'Re-scored')}><RefreshCw className="h-3.5 w-3.5" />Re-score</Button>}
        </span>
      </Card>
      {!l.automatable && can('APPROVED', 'READY_FOR_REVIEW') && <p className="text-xs text-muted">{ATS_LABEL[l.atsType] ?? 'This site'} is not automated (site rules / login). Use the apply kit below with “Posting”, then “I applied: mark submitted”, or run it with Claude Code + Claude in Chrome.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`Apply kit${l.applyKit ? (l.applyKit.complete ? ' · complete' : ` · ${l.applyKit.missingRequired.length} required missing`) : ''}`}
              description={l.applyKit ? `Questions from ${l.applyKit.questionsFrom === 'ats' ? 'the job board' : 'the standard field set'}. Answers come only from your profile and saved answers; blanks are never guessed.` : 'Prepared when a job is shortlisted.'}
              action={l.applyKit && !can('SUBMITTED', 'APPLYING') ? <Button size="sm" loading={busy === 'kit'} onClick={saveKit}>Save kit</Button> : undefined} />
            {l.applyKit ? (
              <div className="space-y-3 p-4">
                <Field label="CV to send">
                  <Select value={l.resume?.id ?? ''} disabled={can('SUBMITTED', 'APPLYING')} onChange={async (e) => { if (await run('cv', () => api(`/autoapply/leads/${id}/kit`, { method: 'PUT', body: { resumeId: e.target.value } }), 'CV updated')) reload(); }}>
                    {!l.resume && <option value="">Upload a CV under Profile & CVs</option>}
                    {resumes?.map((r) => <option key={r.id} value={r.id}>{r.label} v{r.version}</option>)}
                  </Select>
                </Field>
                {l.fitBreakdown?.resumeReason && <p className="-mt-2 text-xs text-muted">Selected because {l.fitBreakdown.resumeReason}</p>}
                {l.applyKit.answers.map((a) => (
                  <div key={a.key} className="rounded-md border border-border p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium text-text">{a.label}{a.required && ' *'}</span>
                      <Badge tone={SRC_TONE[a.source] ?? 'neutral'}>{a.source}</Badge>
                      {a.sensitive && <Badge tone="warning">sensitive</Badge>}
                      {a.needsReview && <Badge tone="danger">needs answer</Badge>}
                    </div>
                    {a.type === 'input_file' ? <p className="flex items-center gap-1.5 text-sm text-muted"><FileUp className="h-3.5 w-3.5" />{l.resume ? `${l.resume.label} v${l.resume.version} (${l.resume.fileName})` : 'No CV selected'}</p>
                      : a.options?.length ? <Select value={answers[a.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [a.key]: e.target.value })}><option value="">Choose…</option>{a.options.map((o) => <option key={o}>{o}</option>)}</Select>
                      : a.type === 'textarea' ? <Textarea value={answers[a.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [a.key]: e.target.value })} className="min-h-20" />
                      : <Input value={answers[a.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [a.key]: e.target.value })} />}
                    {a.note && <p className="mt-1 text-xs text-muted">{a.note}</p>}
                  </div>
                ))}
                <Field label="Cover note"><Textarea value={cover} onChange={(e) => setCover(e.target.value)} className="min-h-32" /></Field>
              </div>
            ) : <p className="p-4 text-sm text-muted">No kit yet. Click “Prepare apply kit”.</p>}
          </Card>

          <Card>
            <CardHeader title="Apply attempts" description="Every run with its evidence. A job counts as submitted only with a confirmation." />
            <ul className="divide-y divide-border">
              {l.attempts.map((a) => (
                <li key={a.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">#{a.attemptNo}</span><Badge>{a.method.toLowerCase()}</Badge><StateBadge value={a.status === 'SUBMITTED' ? 'completed' : a.status === 'RUNNING' ? 'running' : a.status.toLowerCase()} /><span className="text-xs text-muted">{fmtDate(a.startedAt, true)}</span></div>
                  {a.error && <p className="text-xs text-warning">{a.error}</p>}
                  {a.evidence?.confirmationText && <p className="rounded bg-surface-2 p-2 text-xs">{a.evidence.confirmationText.slice(0, 300)}</p>}
                  {a.evidence?.note && <p className="text-xs">“{a.evidence.note}”</p>}
                  <div className="flex gap-3 text-xs">{a.evidence?.confirmationUrl && <a className="text-accent underline" href={a.evidence.confirmationUrl} target="_blank" rel="noreferrer noopener">confirmation page</a>}{a.evidence?.screenshot && <a className="text-accent underline" href={`/api/autoapply/attempts/${a.id}/screenshot`} target="_blank" rel="noreferrer">screenshot</a>}</div>
                  {!!a.missingFields.length && <p className="text-xs text-muted">Missing: {a.missingFields.join(', ')}</p>}
                </li>
              ))}
              {!l.attempts.length && <li className="px-4 py-3 text-xs text-muted">No attempts yet.</li>}
            </ul>
          </Card>

          <Card><CardHeader title="Job description" /><div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap p-4 text-sm">{l.description || <span className="text-muted">Not available from this source. Use “Fetch details” or open the posting.</span>}</div></Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Why this score" />
            <div className="space-y-3 p-4">
              {!!l.blockers.length && <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-xs text-warning"><p className="font-medium">Not eligible</p><ul className="mt-1 list-disc pl-4">{l.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
              {DIMS.map((k) => l.fitBreakdown?.[k] && (
                <div key={k}>
                  <div className="flex justify-between text-xs"><span className="font-medium capitalize">{k}</span><span className="tabular-nums text-muted">{l.fitBreakdown[k].score} · weight {l.fitBreakdown[k].weight}</span></div>
                  <Progress value={l.fitBreakdown[k].score} className="my-1" />
                  <p className="text-xs text-muted">{l.fitBreakdown[k].reason}</p>
                </div>
              ))}
              {l.fitExplanation && <p className="border-t border-border pt-3 text-xs">{l.fitExplanation}</p>}
              {!!l.fitBreakdown?.missingSkills?.length && <div className="flex flex-wrap gap-1">{l.fitBreakdown.missingSkills.map((s) => <Badge key={s} tone="warning">{s}</Badge>)}</div>}
            </div>
          </Card>
          {l.aiFit && (
            <Card>
              <CardHeader title={`AI review · ${l.aiFit.score}/100`} description="Semantic second opinion; eligibility rules above still decide." />
              <div className="space-y-2 p-4 text-xs">
                <p>{l.aiFit.explanation}</p>
                {!!l.aiFit.mandatoryMissing.length && <p className="text-warning">Required but not shown: {l.aiFit.mandatoryMissing.join('; ')}</p>}
                {!!l.aiFit.strengths.length && <p><span className="font-medium">Strengths:</span> {l.aiFit.strengths.join('; ')}</p>}
                {!!l.aiFit.gaps.length && <p><span className="font-medium">Gaps:</span> {l.aiFit.gaps.join('; ')}</p>}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Recruiters" action={<Link className="text-xs text-accent" href={`/auto-apply/recruiters?leadId=${l.id}`}>Add</Link>} />
            <ul className="divide-y divide-border">{l.recruiters.map((r) => <li key={r.id} className="px-4 py-2 text-sm">{r.name ?? r.email}<p className="text-xs text-muted">{r.email}{r.title && ` · ${r.title}`}</p></li>)}{!l.recruiters.length && <li className="px-4 py-3 text-xs text-muted">None saved for this job.</li>}</ul>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-2 gap-2 p-4 text-xs">
              <dt className="text-muted">Found via</dt><dd>{l.discoveredVia.join(', ')}</dd>
              <dt className="text-muted">Seen</dt><dd>{l.seenCount}× · first {relTime(l.discoveredAt)}</dd>
              <dt className="text-muted">Published</dt><dd>{fmtDate(l.publishedAt)}</dd>
              <dt className="text-muted">Automation</dt><dd>{l.automatable ? 'Apply runner supported' : 'Manual / Claude in Chrome'}</dd>
            </dl>
            {!!l.tasks.length && <ul className="border-t border-border px-4 py-2 text-xs">{l.tasks.map((t) => <li key={t.id}><Link className="text-accent" href={`/tasks/${t.id}`}>{t.type.replace(/_/g, ' ')}</Link> · {t.state.replace(/_/g, ' ')}</li>)}</ul>}
          </Card>
        </div>
      </div>

      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="Mark as submitted">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run('sub', () => api(`/autoapply/leads/${id}/submitted`, { body: { note: ev.note, ...(ev.confirmationUrl && { confirmationUrl: ev.confirmationUrl }) } }), 'Marked as submitted')) { setSubmitOpen(false); reload(); } }}>
          <Field label="How did you apply? (evidence)" hint="e.g. “Applied on LinkedIn Easy Apply, confirmation email received 14:05”"><Textarea required value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} /></Field>
          <Field label="Confirmation URL (optional)"><Input type="url" value={ev.confirmationUrl} onChange={(e) => setEv({ ...ev, confirmationUrl: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit" loading={busy === 'sub'}>Mark submitted</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
