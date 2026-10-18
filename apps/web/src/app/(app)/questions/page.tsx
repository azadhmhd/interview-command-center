'use client';
import { Library } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, EmptyState, ErrorBox, Input, Loading, PageHeader, Select, SOURCE_LABEL, StateBadge } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useRoundLabel, useSettings } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

interface Canonical { id: string; prompt: string; tags: string[]; difficulty?: string; roundTypes: string[]; masteryStatus: string; dueAt: string; updatedAt: string; occurrences: { id: string; source: string; application?: { companyName: string } }[]; _count: { attempts: number } }

export default function Questions() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [roundType, setRoundType] = useState('');
  const [mastery, setMastery] = useState('');
  const [source, setSource] = useState('');
  const { settings } = useSettings();
  const roundLabel = useRoundLabel();
  const qs = new URLSearchParams({ ...(q && { q }), ...(tag && { tag }), ...(roundType && { roundType }), ...(mastery && { mastery }), ...(source && { source }) }).toString();
  const { data, error, isLoading } = useApi<Canonical[]>(`/questions${qs ? `?${qs}` : ''}`, { keepPreviousData: true });
  const { data: tags } = useApi<{ tag: string; count: number }[]>('/questions/tags');
  return (
    <div>
      <PageHeader title="Question library" description="Every question across all interviews. The same question asked twice links to one entry with both occurrences." />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input aria-label="Full-text search" placeholder='Search questions & answers (e.g. "rate limiter" -redis)' value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
        <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Any tag</option>{tags?.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}</Select>
        <Select aria-label="Round type" value={roundType} onChange={(e) => setRoundType(e.target.value)}><option value="">Any round</option>{settings?.roundTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Mastery" value={mastery} onChange={(e) => setMastery(e.target.value)}><option value="">Any mastery</option><option value="new">New</option><option value="learning">Learning</option><option value="reviewing">Reviewing</option><option value="mastered">Mastered</option></Select>
          <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Any source</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading && !data ? <Loading /> : !data?.length ? <Card><EmptyState icon={<Library className="h-6 w-6" />} title={qs ? 'No matches' : 'Your knowledge base is empty'} description="Questions you capture after interviews collect here and become reusable across companies." /></Card> : (
        <Card><ul className="divide-y divide-border">
          {data.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/questions/${c.id}`} className="text-sm font-medium hover:underline">{c.prompt}</Link>
                <StateBadge value={c.masteryStatus} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {[...new Set(c.occurrences.map((o) => o.source))].map((s) => <StateBadge key={s} value={s} />)}
                {[...new Set(c.occurrences.map((o) => o.application?.companyName).filter(Boolean))].map((n) => <Badge key={n}>{n}</Badge>)}
                {c.roundTypes.map((r) => <span key={r}>{roundLabel(r)}</span>)}
                {c.tags.map((t) => <Badge key={t} tone="info">#{t}</Badge>)}
                <span>· {c._count.attempts} attempts · next review {fmtDate(c.dueAt)}</span>
              </div>
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  );
}
