'use client';
import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SectionVisual } from '@/components/section-visual';
import { Badge, Card, CardHeader, ErrorBox, Loading, Markdown, PageHeader, Tabs } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { Lang } from '@/lib/coding';
import { DIFF_TONE, type Lesson, VISUALS } from '@/lib/sections';

const LANGS: { value: Lang; label: string }[] = [{ value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }];

export default function SectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: t, error, isLoading } = useApi<Lesson>(`/coding/sections/${slug}`);
  const [lang, setLang] = useState<Lang>('python');
  if (isLoading) return <Loading />;
  if (error || !t) return <ErrorBox error={error ?? new Error('Section not found')} />;
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/coding', label: 'Coding practice' }} title={t.title} description={t.summary} />
      {VISUALS[t.slug] && (
        <Card>
          <CardHeader title="See it work" description={VISUALS[t.slug].title} />
          <div className="p-4"><SectionVisual topic={t.slug} /></div>
        </Card>
      )}
      <Card>
        <CardHeader title="Overview" />
        <div className="p-4 text-sm"><Markdown>{t.lesson}</Markdown></div>
      </Card>
      <Card>
        <CardHeader title="Template" description="A starting shape to adapt, not a solution to memorise." action={<Tabs value={lang} onChange={setLang} items={LANGS} />} />
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">{t.template[lang]}</pre>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Complexity" />
          <p className="p-4 text-sm">{t.complexity}</p>
        </Card>
        <Card>
          <CardHeader title="Common mistakes" />
          <ul className="list-disc space-y-1 p-4 pl-8 text-sm">{t.pitfalls.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      </div>
      <Card>
        <CardHeader title="Practice" description="Solve in Python or JavaScript; a run that passes every test marks the problem done." />
        <ul className="divide-y divide-border">
          {t.problems.map((p) => (
            <li key={p.slug}>
              <Link href={`/coding/${p.slug}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                {p.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="Not done" />}
                <span className="flex-1"><span className="text-sm font-medium">{p.title}</span><span className="block text-xs text-muted">{p.summary}</span></span>
                <Badge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
