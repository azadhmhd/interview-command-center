'use client';
import { ArrowDown, ArrowUp, ExternalLink, FileText, Link2, Plus, Search, Share2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApplicationForm } from '@/components/application-form';
import { JobResumes } from '@/components/resume/job-resumes';
import { ShareDialog } from '@/components/share-dialog';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorBox, Input, Loading, Markdown, PageHeader, Select, StateBadge, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { useRoundLabel, useSettings } from '@/lib/hooks';
import type { Application, Round } from '@/lib/types';
import { fmtDate, relTime } from '@/lib/utils';

interface Detail extends Application {
  resume?: { id: string; label: string; version: number } | null;
  contacts: { id: string; name: string; role: string; email?: string; phone?: string; linkedin?: string; notes?: string }[];
  activities: { id: string; type: string; message: string; createdAt: string }[];
  attachments: { id: string; kind: string; label: string; fileName?: string; url?: string; createdAt: string }[];
  courses: { id: string; title: string; mode: string; createdAt: string; generator: string }[];
  reminders: { id: string; title: string; dueAt: string; kind: string; status: string }[];
  research: { id: string; url: string; title: string; summary: string; retrievedAt: string }[];
  rounds: (Round & { _count: { occurrences: number } })[];
}

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: a, error, isLoading, mutate } = useApi<Detail>(`/applications/${id}`);
  const { settings } = useSettings();
  const roundLabel = useRoundLabel();
  const { busy, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [roundForm, setRoundForm] = useState({ type: '', title: '', scheduledAt: '', durationMinutes: '60' });
  const [note, setNote] = useState('');
  const [contact, setContact] = useState({ name: '', role: 'recruiter', email: '' });
  const [link, setLink] = useState({ label: '', url: '' });

  if (isLoading) return <Loading />;
  if (error || !a) return <ErrorBox error={error ?? new Error('Not found')} />;
  const reload = () => { mutate(); refresh('/dashboard', '/applications'); };

  const addRound = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('round', () => api<Round>(`/applications/${id}/rounds`, { body: { type: roundForm.type || settings?.roundTypes[0]?.key, title: roundForm.title || undefined, scheduledAt: roundForm.scheduledAt ? new Date(roundForm.scheduledAt).toISOString() : undefined, durationMinutes: Number(roundForm.durationMinutes) || undefined } }), 'Round added — preparation milestones scheduled');
    if (r) { setRoundForm({ type: '', title: '', scheduledAt: '', durationMinutes: '60' }); reload(); }
  };
  const reorder = async (i: number, dir: -1 | 1) => {
    const ids = a.rounds.map((r) => r.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await run('reorder', () => api(`/applications/${id}/rounds/reorder`, { body: { ids } }));
    reload();
  };
  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('label', file.name);
    await run('upload', () => api(`/applications/${id}/attachments`, { form }), 'Attachment uploaded');
    reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/applications', label: 'Applications' }} title={<>{a.companyName} <span className="font-normal text-muted">— {a.jobTitle}</span></>}
        description={<span className="flex flex-wrap items-center gap-2"><StateBadge value={a.status} /><Badge tone={a.priority === 'HIGH' ? 'danger' : 'neutral'}>{a.priority.toLowerCase()} priority</Badge>{a.location}{a.appliedAt && <span>· applied {fmtDate(a.appliedAt)}</span>}</span>}
        actions={<>
          <Select aria-label="Status" value={a.status} onChange={async (e) => { await run('status', () => api(`/applications/${id}`, { method: 'PATCH', body: { status: e.target.value } }), 'Status updated'); reload(); }}>
            {settings?.statuses.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Button variant="outline" onClick={() => setSharing(true)}><Share2 className="h-4 w-4" />Share</Button>
          <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Interview sequence" description="Each company gets its own rounds. Scheduling a round creates preparation milestones automatically." />
            {a.rounds.length ? (
              <ol className="divide-y divide-border">
                {a.rounds.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs tabular-nums">{r.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/rounds/${r.id}`} className="text-sm font-medium hover:underline">{r.title || roundLabel(r.type)}</Link>
                      <p className="text-xs text-muted">{roundLabel(r.type)} · {r.scheduledAt ? `${fmtDate(r.scheduledAt, true)} (${relTime(r.scheduledAt)})` : 'not scheduled'} · {r._count.occurrences} questions</p>
                    </div>
                    <StateBadge value={r.outcome !== 'pending' ? r.outcome : r.status} />
                    <div className="flex">
                      <Button variant="ghost" size="icon" disabled={i === 0 || busy === 'reorder'} onClick={() => reorder(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" disabled={i === a.rounds.length - 1 || busy === 'reorder'} onClick={() => reorder(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="No rounds yet" description="Add the rounds this company runs, in order." />}
            <form onSubmit={addRound} className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1.3fr_80px_auto]">
              <Select aria-label="Round type" value={roundForm.type} onChange={(e) => setRoundForm({ ...roundForm, type: e.target.value })}>{settings?.roundTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
              <Input aria-label="Round title" placeholder="Title (optional)" value={roundForm.title} onChange={(e) => setRoundForm({ ...roundForm, title: e.target.value })} />
              <Input aria-label="Scheduled at" type="datetime-local" value={roundForm.scheduledAt} onChange={(e) => setRoundForm({ ...roundForm, scheduledAt: e.target.value })} />
              <Input aria-label="Duration minutes" type="number" min={5} value={roundForm.durationMinutes} onChange={(e) => setRoundForm({ ...roundForm, durationMinutes: e.target.value })} />
              <Button type="submit" loading={busy === 'round'}><Plus className="h-4 w-4" />Add round</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Job description" action={a.jobUrl ? <a href={a.jobUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-xs text-accent">Job post <ExternalLink className="h-3 w-3" /></a> : undefined} />
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap p-4 text-sm">{a.jobDescription || <span className="text-muted">No job description yet — add one for sharper preparation.</span>}</div>
          </Card>

          <Card>
            <CardHeader title="Activity & communication" />
            <form className="flex gap-2 border-b border-border p-3" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await run('note', () => api(`/applications/${id}/activities`, { body: { type: 'note', message: note } })); setNote(''); reload(); }}>
              <Input aria-label="Add note" placeholder="Add a note or log a communication…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" variant="outline" loading={busy === 'note'}>Add</Button>
            </form>
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {a.activities.map((x) => <li key={x.id} className="px-4 py-2 text-sm"><p className="whitespace-pre-wrap">{x.message}</p><p className="text-xs text-muted">{x.type.replace('_', ' ')} · {fmtDate(x.createdAt, true)}</p></li>)}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-4 text-sm">
              <dt className="text-muted">Salary</dt><dd>{a.salaryExpectation ? `${a.salaryCurrency} ${a.salaryExpectation.toLocaleString()}` : '—'}</dd>
              <dt className="text-muted">Notice</dt><dd>{a.noticePeriodDays != null ? `${a.noticePeriodDays} days` : '—'}</dd>
              <dt className="text-muted">CV sent</dt><dd>{a.resume ? `${a.resume.label} v${a.resume.version}` : '—'}</dd>
              <dt className="text-muted">Source</dt><dd>{a.source ?? '—'}</dd>
              <dt className="text-muted">Next action</dt><dd>{a.nextAction ?? '—'}{a.nextActionAt && <span className="block text-xs text-muted">{relTime(a.nextActionAt)}</span>}</dd>
              {a.offerDetails && <><dt className="text-muted">Offer</dt><dd>{a.offerDetails}</dd></>}
              {a.rejectionReason && <><dt className="text-muted">Rejection</dt><dd>{a.rejectionReason}</dd></>}
              {a.withdrawalReason && <><dt className="text-muted">Withdrawn</dt><dd>{a.withdrawalReason}</dd></>}
            </dl>
            {a.companyNotes && <div className="border-t border-border p-4"><Markdown>{a.companyNotes}</Markdown></div>}
          </Card>

          <JobResumes applicationId={id} />

          <Card>
            <CardHeader title="Preparation" action={<Button size="sm" variant="outline" loading={busy === 'research'} onClick={async () => { const t = await run('research', () => api<{ id: string }>(`/applications/${id}/research`, { method: 'POST' }), 'Research task created'); if (t) router.push(`/tasks/${t.id}`); }}><Search className="h-3.5 w-3.5" />Research</Button>} />
            <ul className="divide-y divide-border">
              {a.courses.map((c) => <li key={c.id} className="px-4 py-2 text-sm"><Link href={`/courses/${c.id}`} className="hover:underline">{c.title}</Link><p className="text-xs text-muted">{c.generator} · {fmtDate(c.createdAt)}</p></li>)}
              {!a.courses.length && <li className="px-4 py-3 text-xs text-muted">Open a round and click “Prepare for this round”.</li>}
            </ul>
            {!!a.research.length && (
              <div className="border-t border-border p-4">
                <p className="mb-2 text-xs font-medium text-muted">Public research sources</p>
                <ul className="space-y-2">{a.research.map((s) => <li key={s.id} className="text-xs"><a href={s.url} target="_blank" rel="noreferrer noopener" className="font-medium text-accent hover:underline">{s.title}</a> <span className="text-muted">· retrieved {fmtDate(s.retrievedAt)}</span><p className="text-muted">{s.summary}</p></li>)}</ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Contacts" />
            <ul className="divide-y divide-border">
              {a.contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 px-4 py-2 text-sm">
                  <div><p className="font-medium">{c.name} <span className="text-xs font-normal text-muted">{c.role.replace('_', ' ')}</span></p>{c.email && <a className="text-xs text-accent" href={`mailto:${c.email}`}>{c.email}</a>}</div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${c.name}`} onClick={async () => { await run('c', () => api(`/applications/${id}/contacts/${c.id}`, { method: 'DELETE' })); reload(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </li>
              ))}
            </ul>
            <form className="grid gap-2 border-t border-border p-3" onSubmit={async (e) => { e.preventDefault(); await run('contact', () => api(`/applications/${id}/contacts`, { body: { ...contact, email: contact.email || undefined } })); setContact({ name: '', role: 'recruiter', email: '' }); reload(); }}>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Contact name" required placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <Select aria-label="Contact role" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })}><option value="recruiter">Recruiter</option><option value="hiring_manager">Hiring manager</option><option value="interviewer">Interviewer</option><option value="other">Other</option></Select>
              </div>
              <Input aria-label="Contact email" type="email" placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              <Button type="submit" size="sm" variant="outline" loading={busy === 'contact'}>Add contact</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Documents & links" />
            <ul className="divide-y divide-border">
              {a.attachments.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  {x.kind === 'link' ? <a href={x.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 truncate hover:underline"><Link2 className="h-3.5 w-3.5" />{x.label}</a>
                    : <a href={`/api/applications/${id}/attachments/${x.id}`} className="flex items-center gap-1.5 truncate hover:underline"><FileText className="h-3.5 w-3.5" />{x.label}</a>}
                  <Button variant="ghost" size="icon" aria-label={`Delete ${x.label}`} onClick={async () => { await run('d', () => api(`/applications/${id}/attachments/${x.id}`, { method: 'DELETE' })); reload(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-border p-3">
              <label className="block text-xs text-muted">Upload (PDF, text, image · max 10 MB)<input type="file" className="mt-1 block w-full text-xs" accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
              <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await run('link', () => api(`/applications/${id}/links`, { body: link })); setLink({ label: '', url: '' }); reload(); }}>
                <Input aria-label="Link label" required placeholder="Label" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} />
                <Input aria-label="Link URL" required type="url" placeholder="https://" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
                <Button type="submit" size="sm" variant="outline">Add</Button>
              </form>
            </div>
          </Card>

          {!!a.reminders.length && (
            <Card>
              <CardHeader title="Reminders" />
              <ul className="divide-y divide-border">{a.reminders.map((r) => <li key={r.id} className="px-4 py-2 text-sm">{r.title}<p className="text-xs text-muted">{relTime(r.dueAt)} · {r.status}</p></li>)}</ul>
            </Card>
          )}
          <Button variant="ghost" size="sm" className="text-danger" onClick={async () => { if (!confirm('Delete this application and all its rounds, questions and courses?')) return; await run('del', () => api(`/applications/${id}`, { method: 'DELETE' })); refresh('/applications'); router.push('/applications'); }}><Trash2 className="h-3.5 w-3.5" />Delete application</Button>
        </div>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit application" wide>
        <ApplicationForm initial={a} onDone={() => { setEditing(false); reload(); }} />
      </Dialog>
      <ShareDialog open={sharing} onClose={() => setSharing(false)} resourceType="APPLICATION" resourceId={a.id} note="Shares this application's journal (rounds, questions and your answers) with one person. Revocable at any time." />
    </div>
  );
}
