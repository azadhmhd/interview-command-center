'use client';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, ErrorBox, Loading, PageHeader, StateBadge, Tabs } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useRoundLabel } from '@/lib/hooks';
import type { Round } from '@/lib/types';
import { fmtDate, relTime } from '@/lib/utils';

export default function Interviews() {
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  // Fixed per tab switch: a fresh timestamp each render changes the SWR key and refetches forever.
  const now = useMemo(() => new Date().toISOString(), [scope]);
  const qs = scope === 'upcoming' ? `?from=${now}` : scope === 'past' ? `?to=${now}` : '';
  const { data, error, isLoading } = useApi<Round[]>(`/rounds${qs}`);
  const roundLabel = useRoundLabel();
  const rows = scope === 'past' ? [...(data ?? [])].reverse() : data ?? [];
  const groups = rows.reduce<Record<string, Round[]>>((g, r) => {
    const k = r.scheduledAt ? new Date(r.scheduledAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Not scheduled';
    (g[k] ??= []).push(r);
    return g;
  }, {});
  return (
    <div>
      <PageHeader title="Interview timeline" description="All rounds across applications."
        actions={<Tabs value={scope} onChange={setScope} items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !rows.length ? <Card><EmptyState icon={<CalendarClock className="h-6 w-6" />} title="No interviews here" description="Add rounds from an application page." /></Card> : (
        <div className="space-y-5">
          {Object.entries(groups).map(([day, rs]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{day}</h2>
              <Card><ul className="divide-y divide-border">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-20 text-sm tabular-nums text-muted">{r.scheduledAt ? new Date(r.scheduledAt).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '—'}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/rounds/${r.id}`} className="text-sm font-medium hover:underline">{r.application?.companyName} — {r.title || roundLabel(r.type)}</Link>
                      <p className="text-xs text-muted">{r.application?.jobTitle} · round {r.sequence} · {r.durationMinutes ?? '?'} min{r.scheduledAt && ` · ${relTime(r.scheduledAt)}`}</p>
                    </div>
                    <Badge>{r._count?.occurrences ?? 0} questions</Badge>
                    {r._count?.courses ? <Badge tone="success">Prep course</Badge> : null}
                    <StateBadge value={r.outcome !== 'pending' ? r.outcome : r.status} />
                  </li>
                ))}
              </ul></Card>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Times shown in your browser&apos;s timezone · {fmtDate(new Date())}</p>
    </div>
  );
}
