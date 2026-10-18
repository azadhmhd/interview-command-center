'use client';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PracticeBox } from '@/components/practice-box';
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, Markdown, PageHeader, SOURCE_LABEL, StateBadge, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import type { Lesson } from '@/lib/types';

export default function LessonPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();
  const { data: c, error, isLoading, mutate } = useApi<{ title: string; learningMode: boolean; lessons: Lesson[] }>(`/courses/${id}`);
  const { busy, run } = useAction();
  if (isLoading) return <Loading />;
  const idx = c?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const l = c?.lessons[idx];
  if (error || !c || !l) return <ErrorBox error={error ?? new Error('Lesson not found')} />;
  const next = c.lessons[idx + 1];
  const setStatus = async (status: string) => { await run('status', () => api(`/courses/${id}/lessons/${l.id}`, { method: 'PATCH', body: { status } })); mutate(); refresh('/dashboard', '/courses'); };

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/courses/${id}`, label: c.title }} title={l.title}
        description={<span className="flex flex-wrap items-center gap-2"><Badge>{l.kind.replace('_', ' ')}</Badge><span>{l.estimatedMinutes} min</span><StateBadge value={l.status === 'completed' ? 'completed' : l.status === 'in_progress' ? 'running' : 'pending'} />{l.generator !== 'deterministic' && <Badge tone="accent">{l.generator} · v{l.version}</Badge>}</span>}
        actions={<>
          <Button variant="outline" loading={busy === 'regen'} disabled={l.status === 'completed'} title={l.status === 'completed' ? 'Completed lessons are kept as they are' : undefined}
            onClick={() => run('regen', () => api(`/courses/${id}/lessons/${l.id}/regenerate`, { method: 'POST' }), 'Regeneration task created — other lessons are untouched')}><RefreshCw className="h-4 w-4" />Regenerate lesson</Button>
          {l.status === 'completed' ? <Button variant="outline" onClick={() => setStatus('in_progress')}>Mark not completed</Button>
            : <Button onClick={() => setStatus('completed')}><CheckCircle2 className="h-4 w-4" />Mark completed</Button>}
        </>} />

      <Card className="p-5">
        {l.objectives.length > 0 && <div className="mb-4"><p className="text-xs font-medium text-muted">Learning objectives</p><ul className="mt-1 list-disc pl-5 text-sm">{l.objectives.map((o) => <li key={o}>{o}</li>)}</ul></div>}
        <Markdown>{l.explanation}</Markdown>
        {l.examples && <><h3 className="mt-4 text-sm font-semibold">Examples</h3><Markdown>{l.examples}</Markdown></>}
        {(l.evaluationCriteria.length > 0 || l.commonMistakes.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {l.evaluationCriteria.length > 0 && <div className="rounded-md bg-success-soft p-3 text-sm"><p className="text-xs font-medium text-success">What good looks like</p><ul className="mt-1 list-disc pl-4">{l.evaluationCriteria.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {l.commonMistakes.length > 0 && <div className="rounded-md bg-danger-soft p-3 text-sm"><p className="text-xs font-medium text-danger">Common mistakes</p><ul className="mt-1 list-disc pl-4">{l.commonMistakes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          </div>
        )}
      </Card>

      {l.questions.length > 0 && (
        <Card>
          <CardHeader title="Interview-style questions" description={c.learningMode ? 'Learning mode: model answers can be revealed before attempting.' : 'Model answers stay hidden until you submit an attempt.'} />
          <ol className="divide-y divide-border">
            {l.questions.map((q, i) => (
              <li key={i} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start gap-2"><span className="text-sm font-medium">{i + 1}. {q.prompt}</span><Badge tone={q.source === 'REPORTED' ? 'accent' : q.source === 'AI_PREDICTED' ? 'warning' : 'neutral'}>{SOURCE_LABEL[q.source] ?? q.source}</Badge></div>
                {q.followUps?.length ? <p className="text-xs text-muted">Follow-ups: {q.followUps.join(' · ')}</p> : null}
                <PracticeBox target={{ lessonId: l.id, questionIndex: i }} prompt={q.prompt} hasModelAnswer={q.hasModelAnswer} revealedAnswer={q.modelAnswer} onAttempt={() => mutate()} />
              </li>
            ))}
          </ol>
        </Card>
      )}
      {next && <div className="flex justify-end"><Link href={`/courses/${id}/lessons/${next.id}`} className="text-sm text-accent hover:underline">Next: {next.title} →</Link></div>}
    </div>
  );
}
