'use client';
import { Repeat } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, Markdown, PageHeader, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';

interface Item { id: string; prompt: string; bestAnswer?: string; tags: string[]; masteryStatus: string; repetitions: number; occurrences: { approvedAnswer?: string; improvedAnswer?: string; source: string; application?: { companyName: string } }[] }
const GRADES = [
  { g: 0, label: 'Forgot', tone: 'danger' }, { g: 2, label: 'Hard', tone: 'outline' }, { g: 4, label: 'Good', tone: 'outline' }, { g: 5, label: 'Easy', tone: 'primary' },
] as const;

/** Active recall: think of the answer first, reveal, grade yourself (SM-2 schedules the next review). */
export default function Revision() {
  const { data, error, isLoading, mutate } = useApi<{ due: Item[]; upcomingCount: number }>('/revision/queue');
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const { busy, run } = useAction();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const item = data.due[0];
  const answer = item && (item.bestAnswer ?? item.occurrences.find((o) => o.approvedAnswer)?.approvedAnswer ?? item.occurrences.find((o) => o.improvedAnswer)?.improvedAnswer);
  const grade = async (g: number) => { await run('g', () => api(`/revision/${item!.id}/review`, { body: { grade: g } })); setRevealed(false); setDone((d) => d + 1); mutate(); refresh('/dashboard'); };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Revision queue" description={`${data.due.length} due now · ${data.upcomingCount} scheduled later${done ? ` · ${done} reviewed this session` : ''}`} />
      {!item ? <Card><EmptyState icon={<Repeat className="h-6 w-6" />} title="Nothing due" description="Questions return here on a spaced-repetition schedule after interviews and practice." /></Card> : (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap gap-1.5">{item.occurrences.slice(0, 2).map((o, i) => <Badge key={i} tone="accent">{o.application?.companyName ?? o.source}</Badge>)}{item.tags.map((t) => <Badge key={t} tone="info">#{t}</Badge>)}<Badge>{item.masteryStatus}</Badge></div>
          <p className="text-lg font-medium">{item.prompt}</p>
          {!revealed ? <Button onClick={() => setRevealed(true)}>I&apos;ve recalled my answer — reveal</Button> : (
            <>
              <div className="rounded-md bg-surface-2 p-4">{answer ? <Markdown>{answer}</Markdown> : <p className="text-sm text-muted">No approved answer yet. <Link className="text-accent underline" href={`/questions/${item.id}`}>Practice & add one</Link>.</p>}</div>
              <div className="flex flex-wrap gap-2"><span className="self-center text-xs text-muted">How well did you recall it?</span>
                {GRADES.map((x) => <Button key={x.g} variant={x.tone === 'danger' ? 'danger' : x.tone} loading={busy === 'g'} onClick={() => grade(x.g)}>{x.label}</Button>)}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
