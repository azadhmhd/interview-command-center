'use client';
import { ClipboardPaste, GraduationCap, MessageSquarePlus, Mic } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuestionEditor } from '@/components/question-editor';
import { QuickCapture } from '@/components/quick-capture';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, StateBadge, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { useRoundLabel, useSettings } from '@/lib/hooks';
import type { Occurrence, Round, Task } from '@/lib/types';
import { fmtDate, relTime, toLocalInput } from '@/lib/utils';

interface RoundDetail extends Round {
  occurrences: Occurrence[];
  courses: { id: string; title: string; mode: string; createdAt: string; generator: string }[];
  reminders: { id: string; title: string; body?: string; dueAt: string; kind: string; status: string }[];
  tasks: Task[];
  attachments: { id: string; kind: string; label: string; url?: string; applicationId?: string }[];
}

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: r, error, isLoading, mutate } = useApi<RoundDetail>(`/rounds/${id}`);
  const { settings } = useSettings();
  const roundLabel = useRoundLabel();
  const { busy, run } = useAction();
  const [capture, setCapture] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notes, setNotes] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [mode, setMode] = useState('STANDARD');
  const [hours, setHours] = useState('');
  const [f, setF] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!r) return;
    setF({
      title: r.title ?? '', type: r.type, scheduledAt: toLocalInput(r.scheduledAt), durationMinutes: r.durationMinutes ? String(r.durationMinutes) : '',
      interviewer: r.interviewer ?? '', format: r.format ?? '', meetingLink: r.meetingLink ?? '', status: r.status, outcome: r.outcome,
      feedback: r.feedback ?? '', nextSteps: r.nextSteps ?? '', notes: r.notes ?? '', confidence: r.confidence ? String(r.confidence) : '',
    });
    setMode(r.prepIntensity);
    setHours(r.studyHoursAvailable ? String(r.studyHoursAvailable) : '');
  }, [r]);

  if (isLoading) return <Loading />;
  if (error || !r) return <ErrorBox error={error ?? new Error('Not found')} />;
  const reload = () => { mutate(); refresh('/dashboard', '/applications', '/rounds', '/tasks'); };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      title: f.title || null, type: f.type, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null, durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : null,
      interviewer: f.interviewer || null, format: f.format || null, meetingLink: f.meetingLink || null, status: f.status, outcome: f.outcome, feedback: f.feedback || null,
      nextSteps: f.nextSteps || null, notes: f.notes || null, confidence: f.confidence ? Number(f.confidence) : null,
    };
    if (await run('details', () => api(`/rounds/${id}`, { method: 'PATCH', body }), f.status === 'completed' && r.status !== 'completed' ? 'Round completed — questions added to your revision queue' : 'Saved')) reload();
  };
  const prepare = async (force = false) => {
    const res = await run('prepare', () => api<{ course: { id: string }; task: Task | null; reused: boolean }>(`/rounds/${id}/prepare`, { body: { mode, studyHours: hours ? Number(hours) : undefined, force } }));
    if (res) router.push(`/courses/${res.course.id}${res.reused ? '?reused=1' : ''}`);
  };
  const upcoming = r.scheduledAt && new Date(r.scheduledAt) > new Date();

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/applications/${r.applicationId}`, label: r.application?.companyName ?? 'Application' }}
        title={<>{r.title || roundLabel(r.type)} <span className="font-normal text-muted">· round {r.sequence}</span></>}
        description={<span className="flex flex-wrap items-center gap-2"><StateBadge value={r.status} />{r.outcome !== 'pending' && <StateBadge value={r.outcome} />}{r.scheduledAt ? `${fmtDate(r.scheduledAt, true)} (${relTime(r.scheduledAt)})` : 'Not scheduled'}{r.meetingLink && <a href={r.meetingLink} target="_blank" rel="noreferrer noopener" className="text-accent underline">Meeting link</a>}</span>}
        actions={<><Button variant="outline" onClick={() => setImporting(true)}><ClipboardPaste className="h-4 w-4" />Paste notes</Button><Button onClick={() => setCapture(true)}><MessageSquarePlus className="h-4 w-4" />Capture question</Button></>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`Questions (${r.occurrences.length})`} description="Exact questions as asked, your original answers, mistakes and improved answers." />
            {r.occurrences.length ? <ul className="divide-y divide-border">{r.occurrences.map((q, i) => <QuestionEditor key={q.id + q.updatedAt} q={q} onChange={reload} defaultOpen={i === r.occurrences.length - 1 && !q.originalAnswer} />)}</ul>
              : <EmptyState title="No questions recorded yet" description="Right after the interview, capture each question — only the question text is required." action={<Button onClick={() => setCapture(true)}>Capture the first question</Button>} />}
          </Card>

          <Card>
            <CardHeader title="Round details, feedback & notes" />
            <form onSubmit={saveDetails} className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type"><Select value={f.type} onChange={set('type')}>{settings?.roundTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select></Field>
                <Field label="Title"><Input value={f.title ?? ''} onChange={set('title')} /></Field>
                <Field label="Date & time"><Input type="datetime-local" value={f.scheduledAt ?? ''} onChange={set('scheduledAt')} /></Field>
                <Field label="Duration (min)"><Input type="number" min={5} value={f.durationMinutes ?? ''} onChange={set('durationMinutes')} /></Field>
                <Field label="Interviewer"><Input value={f.interviewer ?? ''} onChange={set('interviewer')} /></Field>
                <Field label="Format"><Select value={f.format ?? ''} onChange={set('format')}><option value="">—</option><option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option><option value="take_home">Take-home</option></Select></Field>
                <Field label="Meeting link" className="sm:col-span-2"><Input type="url" value={f.meetingLink ?? ''} onChange={set('meetingLink')} /></Field>
                <Field label="My confidence (1-5)"><Select value={f.confidence ?? ''} onChange={set('confidence')}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <Field label="Status"><Select value={f.status} onChange={set('status')}><option value="planned">Planned</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
                <Field label="Outcome"><Select value={f.outcome} onChange={set('outcome')}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="unknown">Unknown</option></Select></Field>
              </div>
              <Field label="Interviewer feedback"><Textarea value={f.feedback ?? ''} onChange={set('feedback')} /></Field>
              <Field label="Next steps"><Input value={f.nextSteps ?? ''} onChange={set('nextSteps')} /></Field>
              <Field label="Notes, architecture sketches, diagrams (Markdown)"><Textarea value={f.notes ?? ''} onChange={set('notes')} className="min-h-28 font-mono text-xs" /></Field>
              <div className="flex justify-end"><Button type="submit" loading={busy === 'details'}>Save round</Button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card id="prepare">
            <CardHeader title={<span className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4" />Prepare for this round</span>} description="Builds a plan from the JD, round type, deadline, your CV and recorded weaknesses. Works without AI; AI enriches it when available." />
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Intensity"><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="QUICK">Quick revision</option><option value="STANDARD">Standard</option><option value="DEEP">Deep preparation</option></Select></Field>
                <Field label="Study hours available"><Input type="number" min={0.5} step={0.5} value={hours} placeholder="auto" onChange={(e) => setHours(e.target.value)} /></Field>
              </div>
              <Button className="w-full" loading={busy === 'prepare'} onClick={() => prepare(false)}>{r.courses.length ? 'Update preparation plan' : 'Prepare for this round'}</Button>
              {r.courses.length > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => prepare(true)}>Generate a fresh course</Button>}
              <ul className="space-y-1">{r.courses.map((c) => <li key={c.id}><Link href={`/courses/${c.id}`} className="text-sm text-accent hover:underline">{c.title}</Link> <span className="text-xs text-muted">· {c.generator}</span></li>)}</ul>
              <Button variant="outline" size="sm" className="w-full" loading={busy === 'mock'} onClick={async () => { const s = await run('mock', () => api<{ session: { id: string } }>('/practice/sessions', { body: { roundId: id, count: 6 } })); if (s) router.push(`/mock/${s.session.id}`); }}><Mic className="h-3.5 w-3.5" />Start a mock interview</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Milestones & reminders" />
            <ul className="divide-y divide-border">
              {r.reminders.map((m) => <li key={m.id} className="px-4 py-2"><p className="text-sm">{m.title}</p><p className="text-xs text-muted">{fmtDate(m.dueAt, true)} · {m.status}</p></li>)}
              {!r.reminders.length && <li className="px-4 py-3 text-xs text-muted">{upcoming ? 'No pending milestones.' : 'Schedule the round to get milestones (3, 2, 1 days before and the interview day).'}</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="AI & agent tasks" action={<Link href="/tasks" className="text-xs text-accent">Queue</Link>} />
            <ul className="divide-y divide-border">
              {r.tasks.map((t) => <li key={t.id} className="px-4 py-2"><div className="flex items-center justify-between gap-2"><Link className="truncate text-sm hover:underline" href={`/tasks/${t.id}`}>{t.title}</Link><StateBadge value={t.state} /></div><p className="truncate text-xs text-muted">{t.state === 'scheduled' ? `Runs ${relTime(t.scheduledFor)}` : t.routingReason}</p></li>)}
              {!r.tasks.length && <li className="px-4 py-3 text-xs text-muted">None yet.</li>}
            </ul>
          </Card>
          {r.attachments.length > 0 && (
            <Card><CardHeader title="Attachments" /><ul className="divide-y divide-border">{r.attachments.map((x) => <li key={x.id} className="px-4 py-2 text-sm">{x.url ? <a href={x.url} className="text-accent" target="_blank" rel="noreferrer noopener">{x.label}</a> : <a className="text-accent" href={`/api/applications/${x.applicationId}/attachments/${x.id}`}>{x.label}</a>}</li>)}</ul></Card>
          )}
          <Badge tone="info" className="whitespace-normal">Tip: mark the round “Completed” afterwards — reported questions join your revision queue and a gap analysis is queued.</Badge>
        </div>
      </div>

      <QuickCapture open={capture} onClose={() => { setCapture(false); reload(); }} roundId={id} />
      <Dialog open={importing} onClose={() => setImporting(false)} title="Paste interview notes" wide>
        <p className="mb-2 text-xs text-muted">Start questions with “Q:” (or end them with “?”); lines after a question become your original answer (“A:” optional). Already-recorded questions are skipped.</p>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-60 font-mono text-xs" placeholder={'Q: How would you design a rate limiter?\nA: Token bucket in Redis...\n\nQ: Explain MVCC'} />
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />Use AI to split free-form notes (runs as a task)</label>
        <div className="mt-3 flex justify-end"><Button loading={busy === 'import'} disabled={!notes.trim()} onClick={async () => {
          const res = await run('import', () => api<{ created: unknown[]; skipped?: number; task?: Task }>(`/rounds/${id}/questions/extract`, { body: { text: notes, useAi } }));
          if (res) { setImporting(false); setNotes(''); reload(); }
        }}>Import questions</Button></div>
      </Dialog>
    </div>
  );
}
