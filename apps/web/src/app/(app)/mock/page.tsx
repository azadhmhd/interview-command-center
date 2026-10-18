'use client';
import { Mic } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, StateBadge, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

interface Session { id: string; title: string; roundType?: string; status: string; createdAt: string; learningMode: boolean; questions: unknown[]; _count: { attempts: number } }

export default function Mock() {
  const { data, error, isLoading } = useApi<Session[]>('/practice/sessions');
  const { settings } = useSettings();
  const router = useRouter();
  const [f, setF] = useState({ roundType: '', count: '5', learningMode: false, generateWithAi: false });
  const { busy, run } = useAction();
  return (
    <div className="space-y-4">
      <PageHeader title="Mock interviews" description="Timed practice from your real past questions, due revision items, course questions and practice prompts." />
      <Card>
        <CardHeader title="Start a mock interview" />
        <form className="grid items-end gap-3 p-4 sm:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); const r = await run('new', () => api<{ session: { id: string } }>('/practice/sessions', { body: { roundType: f.roundType || undefined, count: Number(f.count), learningMode: f.learningMode, generateWithAi: f.generateWithAi } })); if (r) router.push(`/mock/${r.session.id}`); }}>
          <Field label="Interview type" className="sm:col-span-2"><Select value={f.roundType} onChange={(e) => setF({ ...f, roundType: e.target.value })}><option value="">Mixed</option>{settings?.roundTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select></Field>
          <Field label="Questions"><Input type="number" min={1} max={20} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
          <div className="space-y-1 text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.learningMode} onChange={(e) => setF({ ...f, learningMode: e.target.checked })} />Learning mode (reveal answers)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.generateWithAi} onChange={(e) => setF({ ...f, generateWithAi: e.target.checked })} />Add AI-generated questions</label>
          </div>
          <Button type="submit" loading={busy === 'new'}><Mic className="h-4 w-4" />Start</Button>
        </form>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState title="No mock interviews yet" /></Card> : (
        <Card><ul className="divide-y divide-border">
          {data.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div><Link href={`/mock/${s.id}`} className="text-sm font-medium hover:underline">{s.title}</Link><p className="text-xs text-muted">{fmtDate(s.createdAt, true)} · {s._count.attempts}/{s.questions.length} answered{s.learningMode && ' · learning mode'}</p></div>
              <StateBadge value={s.status === 'completed' ? 'completed' : 'running'} />
            </li>
          ))}
        </ul></Card>
      )}
      <Badge tone="info" className="whitespace-normal">Practice scores are coaching signals, not predictions of interview outcomes.</Badge>
    </div>
  );
}
