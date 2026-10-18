'use client';
import { Card, CardHeader, EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useRoundLabel } from '@/lib/hooks';

interface A {
  scores: { week: string; avg: number; n: number }[]; mastery: { masteryStatus: string; _count: number }[]; appsPerWeek: { week: string; n: number }[];
  roundOutcomes: { type: string; outcome: string; _count: number }[]; tokens: { day: string; tokens: number; calls: number }[]; note: string;
}

/** Minimal inline SVG bar chart — no chart library needed for a few series. */
function Bars({ rows, max, fmt }: { rows: { label: string; value: number; sub?: string }[]; max?: number; fmt?: (v: number) => string }) {
  if (!rows.length) return <EmptyState title="No data yet" />;
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-44 items-end gap-1.5 px-4 pb-6 pt-4">
      {rows.map((r) => (
        <div key={r.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${r.label}: ${fmt ? fmt(r.value) : r.value}${r.sub ? ` (${r.sub})` : ''}`}>
          <span className="mb-1 text-center text-[10px] tabular-nums text-muted">{fmt ? fmt(r.value) : r.value}</span>
          <div className="w-full rounded-t bg-accent/80" style={{ height: `${(r.value / m) * 100}%`, minHeight: 2 }} />
          <span className="absolute -bottom-5 left-0 right-0 truncate text-center text-[10px] text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
const wk = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Analytics() {
  const { data, error, isLoading } = useApi<A>('/analytics');
  const roundLabel = useRoundLabel();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const types = [...new Set(data.roundOutcomes.map((r) => r.type))];
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description={data.note} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Average practice score per week" description="0–10, evaluated attempts only" /><Bars rows={data.scores.map((s) => ({ label: wk(s.week), value: Math.round(s.avg * 10) / 10, sub: `${s.n} attempts` }))} max={10} /></Card>
        <Card><CardHeader title="Applications per week" /><Bars rows={data.appsPerWeek.map((s) => ({ label: wk(s.week), value: s.n }))} /></Card>
        <Card><CardHeader title="Question mastery" /><Bars rows={['new', 'learning', 'reviewing', 'mastered'].map((m) => ({ label: m, value: data.mastery.find((x) => x.masteryStatus === m)?._count ?? 0 }))} /></Card>
        <Card><CardHeader title="AI token usage (30 days)" description="Reported by your endpoint when available" /><Bars rows={data.tokens.map((t) => ({ label: wk(t.day), value: t.tokens, sub: `${t.calls} calls` }))} fmt={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} /></Card>
      </div>
      <Card>
        <CardHeader title="Round outcomes by interview type" />
        {types.length ? (
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Type</th>{['pending', 'passed', 'failed', 'unknown'].map((o) => <th key={o} className="font-medium">{o}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{types.map((t) => <tr key={t}><td className="px-4 py-2">{roundLabel(t)}</td>{['pending', 'passed', 'failed', 'unknown'].map((o) => <td key={o} className="tabular-nums">{data.roundOutcomes.find((r) => r.type === t && r.outcome === o)?._count ?? 0}</td>)}</tr>)}</tbody></table>
        ) : <EmptyState title="No rounds yet" />}
      </Card>
    </div>
  );
}
