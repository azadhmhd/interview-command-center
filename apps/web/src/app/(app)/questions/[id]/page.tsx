'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EvaluationView, PracticeBox } from '@/components/practice-box';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, Markdown, PageHeader, Select, StateBadge, Textarea, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useRoundLabel } from '@/lib/hooks';
import type { Attempt, Occurrence } from '@/lib/types';
import { fmtDate } from '@/lib/utils';

interface Detail {
  id: string; prompt: string; tags: string[]; difficulty?: string; roundTypes: string[]; masteryStatus: string; bestAnswer?: string; dueAt: string; inRevision: boolean;
  occurrences: (Occurrence & { application?: { id: string; companyName: string; jobTitle: string }; round?: { id: string; type: string; sequence: number } })[];
  attempts: Attempt[]; related: { id: string; prompt: string; masteryStatus: string }[];
}

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error, isLoading, mutate } = useApi<Detail>(`/questions/${id}`);
  const roundLabel = useRoundLabel();
  const { busy, run } = useAction();
  const [f, setF] = useState({ tags: '', difficulty: '', bestAnswer: '' });
  useEffect(() => { if (c) setF({ tags: c.tags.join(', '), difficulty: c.difficulty ?? '', bestAnswer: c.bestAnswer ?? '' }); }, [c]);
  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorBox error={error ?? new Error('Not found')} />;
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/questions', label: 'Question library' }} title={c.prompt} description={<span className="flex flex-wrap gap-2"><StateBadge value={c.masteryStatus} />{c.inRevision && <span>Next review {fmtDate(c.dueAt)}</span>}</span>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Practice this question" description="Each attempt is kept, scored and compared with the previous one." />
            <div className="p-4"><PracticeBox target={{ canonicalQuestionId: c.id }} prompt={c.prompt} hasModelAnswer={!!c.bestAnswer} onAttempt={() => mutate()} /></div>
          </Card>
          <Card>
            <CardHeader title={`Occurrences (${c.occurrences.length})`} description="Each time this question appeared — originals are preserved." />
            <ul className="divide-y divide-border">
              {c.occurrences.map((o) => (
                <li key={o.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><StateBadge value={o.source} />{o.application && <Link className="font-medium hover:underline" href={o.round ? `/rounds/${o.round.id}` : `/applications/${o.application.id}`}>{o.application.companyName}{o.round && ` · round ${o.round.sequence} (${roundLabel(o.round.type)})`}</Link>}<span className="text-xs text-muted">{fmtDate(o.askedAt ?? o.createdAt)}</span></div>
                  {o.prompt !== c.prompt && <p className="text-xs text-muted">Asked as: “{o.prompt}”</p>}
                  {o.originalAnswer && <details><summary className="cursor-pointer text-xs text-accent">Original answer</summary><Markdown className="mt-1">{o.originalAnswer}</Markdown></details>}
                  {o.conceptsMissed.length > 0 && <p className="text-xs">Missed: {o.conceptsMissed.join(', ')}</p>}
                  {o.sourceUrl && <a className="text-xs text-accent underline" href={o.sourceUrl} target="_blank" rel="noreferrer noopener">Public source</a>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={`Attempt history (${c.attempts.length})`} />
            <ul className="divide-y divide-border">
              {c.attempts.map((a) => <li key={a.id} className="space-y-2 px-4 py-3 text-sm"><p className="text-xs text-muted">{fmtDate(a.createdAt, true)}</p><p className="whitespace-pre-wrap">{a.answer}</p>{a.evaluation && <EvaluationView e={a.evaluation} />}</li>)}
              {!c.attempts.length && <li className="px-4 py-3 text-xs text-muted">No attempts yet.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Knowledge entry" />
            <form className="space-y-3 p-4" onSubmit={async (e) => { e.preventDefault(); await run('save', () => api(`/questions/${id}`, { method: 'PATCH', body: { tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), difficulty: f.difficulty || null, bestAnswer: f.bestAnswer || null } }), 'Saved'); mutate(); }}>
              <Field label="Tags"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="postgres, transactions" /></Field>
              <Field label="Difficulty"><Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="">—</option><option>easy</option><option>medium</option><option>hard</option></Select></Field>
              <Field label="Best answer (model answer for practice)"><Textarea value={f.bestAnswer} onChange={(e) => setF({ ...f, bestAnswer: e.target.value })} className="min-h-32" /></Field>
              <div className="flex gap-2"><Button type="submit" loading={busy === 'save'}>Save</Button>
                <Button variant="outline" onClick={async () => { await run('rev', () => api(`/questions/${id}`, { method: 'PATCH', body: { inRevision: !c.inRevision } })); mutate(); }}>{c.inRevision ? 'Remove from revision' : 'Add to revision'}</Button></div>
            </form>
          </Card>
          {c.related.length > 0 && <Card><CardHeader title="Related questions" /><ul className="divide-y divide-border">{c.related.map((r) => <li key={r.id} className="px-4 py-2 text-sm"><Link className="hover:underline" href={`/questions/${r.id}`}>{r.prompt}</Link> <Badge>{r.masteryStatus}</Badge></li>)}</ul></Card>}
        </div>
      </div>
    </div>
  );
}
