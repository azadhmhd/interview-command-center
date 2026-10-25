'use client';
import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, ErrorBox, Loading, PageHeader, Progress } from '@/components/ui';
import { useApi } from '@/lib/api';
import { DIFF_TONE, type Section } from '@/lib/sections';

export default function CodingPractice() {
  const { data, error, isLoading } = useApi<Section[]>('/coding/sections');
  if (isLoading && !data) return <Loading />;
  const all = data?.flatMap((t) => t.problems) ?? [];
  const done = all.filter((p) => p.done).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Coding practice" description="Problems grouped by the pattern they practise. Each section has a step-by-step visual and a lesson; solve the problems in Python or JavaScript in your browser, then ask for an AI review." />
      <ErrorBox error={error} />
      <Card className="p-4">
        <div className="flex justify-between text-sm"><span className="font-medium">Your progress</span><span className="tabular-nums text-muted">{done}/{all.length} problems</span></div>
        <Progress value={all.length ? (done / all.length) * 100 : 0} className="mt-2" />
      </Card>
      {data?.map((t, i) => {
        const n = t.problems.filter((p) => p.done).length;
        return (
          <Card key={t.slug}>
            <Link href={`/coding/sections/${t.slug}`} className="block border-b border-border p-4 hover:bg-surface-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold"><span className="mr-1.5 text-accent">{i + 1}.</span>{t.title} <span className="font-normal text-muted">({t.problems.length} problems)</span></p>
                <span className="shrink-0 text-xs tabular-nums text-muted">{n}/{t.problems.length}</span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{t.summary}</p>
              <Progress value={(n / t.problems.length) * 100} className="mt-2" />
            </Link>
            <ul className="divide-y divide-border">
              {t.problems.map((p) => (
                <li key={p.slug}>
                  <Link href={`/coding/${p.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                    {p.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-4 w-4 shrink-0 text-muted" aria-label="Not done" />}
                    <span className="flex-1">{p.title}</span>
                    <Badge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
