'use client';
import { AlertTriangle, Bell, Bot, CalendarClock, Check, GraduationCap, Repeat, X } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, LinkButton, Loading, PageHeader, Progress, Stat, StateBadge, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { useRoundLabel } from '@/lib/hooks';
import { fmtDate, relTime } from '@/lib/utils';

interface Dash {
  totals: { applications: number; byStatus: Record<string, number> };
  upcomingInterviews: { id: string; type: string; title?: string; scheduledAt: string; application: { id: string; companyName: string; jobTitle: string }; hasCourse: boolean }[];
  prepDeadlines: { id: string; title: string; dueAt: string; status: string; roundId?: string; application?: { companyName: string } }[];
  overdueFollowUps: { id: string; title: string; dueAt: string; application: { id: string; companyName: string; jobTitle: string } }[];
  overdueActions: { id: string; companyName: string; nextAction?: string; nextActionAt: string }[];
  agentTasks: { id: string; title: string; state: string; routingReason?: string }[];
  activeTasks: { id: string; title: string; state: string }[];
  failedTasks: { id: string; title: string; lastError?: string }[];
  coursesInProgress: { id: string; title: string; interviewAt?: string; completed: number; total: number }[];
  revisionDue: number;
  weakCompetencies: { fromInterviews: { concept: string; count: number }[]; lowMasteryTags: { tag: string; count: number }[] };
  outcomes: Record<string, number>;
  conversion: { applied: number; interviewed: number; offers: number; applicationToInterview: number | null; interviewToOffer: number | null };
  notifications: { id: string; title: string; body?: string; dueAt: string; kind: string; roundId?: string; application?: { id: string; companyName: string } }[];
}

export default function Dashboard() {
  const { data, error, isLoading } = useApi<Dash>('/dashboard', { refreshInterval: 60000 });
  const roundLabel = useRoundLabel();
  const { run } = useAction();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const reminder = async (id: string, action: 'done' | 'dismiss') => { await run(id, () => api(`/reminders/${id}/${action}`, { method: 'POST' })); refresh('/dashboard'); };

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description="Everything here is computed from your own records." actions={<LinkButton href="/applications?new=1">New application</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active applications" value={data.totals.applications} href="/applications" hint={Object.entries(data.totals.byStatus).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ') || 'None yet'} />
        <Stat label="Upcoming interviews (14d)" value={data.upcomingInterviews.length} href="/interviews" />
        <Stat label="Questions due for revision" value={data.revisionDue} href="/revision" tone={data.revisionDue ? 'warning' : undefined} />
        <Stat label="Tasks awaiting you" value={data.agentTasks.length + data.failedTasks.length} href="/tasks" tone={data.failedTasks.length ? 'danger' : undefined} hint={`${data.activeTasks.length} running / queued`} />
      </div>

      {!!data.notifications.length && (
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Bell className="h-4 w-4" />Reminders</span>} />
          <ul className="divide-y divide-border">
            {data.notifications.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.roundId ? <Link href={`/rounds/${n.roundId}`} className="hover:underline">{n.title}</Link> : n.title}{n.application && <span className="text-muted"> · {n.application.companyName}</span>}</p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded p-1 text-muted hover:text-success" aria-label="Mark done" onClick={() => reminder(n.id, 'done')}><Check className="h-4 w-4" /></button>
                  <button className="rounded p-1 text-muted hover:text-danger" aria-label="Dismiss" onClick={() => reminder(n.id, 'dismiss')}><X className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" />Upcoming interviews</span>} action={<Link className="text-xs text-accent" href="/interviews">Timeline</Link>} />
          {data.upcomingInterviews.length ? (
            <ul className="divide-y divide-border">
              {data.upcomingInterviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/rounds/${r.id}`} className="text-sm font-medium hover:underline">{r.application.companyName} — {r.title || roundLabel(r.type)}</Link>
                    <p className="text-xs text-muted">{fmtDate(r.scheduledAt, true)} · {relTime(r.scheduledAt)}</p>
                  </div>
                  {r.hasCourse ? <Badge tone="success">Prep ready</Badge> : <LinkButton size="sm" variant="outline" href={`/rounds/${r.id}#prepare`}>Prepare</LinkButton>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No interviews in the next 14 days" description="Add rounds to an application and schedule them to get a preparation plan." />}
        </Card>

        <Card>
          <CardHeader title="Preparation deadlines" />
          {data.prepDeadlines.length ? (
            <ul className="divide-y divide-border">
              {data.prepDeadlines.slice(0, 8).map((d) => (
                <li key={d.id} className="px-4 py-2">
                  <p className="text-sm">{d.roundId ? <Link className="hover:underline" href={`/rounds/${d.roundId}`}>{d.title}</Link> : d.title}</p>
                  <p className="text-xs text-muted">{d.application?.companyName} · {relTime(d.dueAt)}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing due" />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4" />Courses in progress</span>} />
          {data.coursesInProgress.length ? (
            <ul className="space-y-3 p-4">
              {data.coursesInProgress.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses/${c.id}`} className="text-sm hover:underline">{c.title}</Link>
                  <div className="mt-1 flex items-center gap-2"><Progress value={(c.completed / Math.max(1, c.total)) * 100} /><span className="text-xs tabular-nums text-muted">{c.completed}/{c.total}</span></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No active courses" />}
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />Weak competencies</span>} description="From concepts you missed or partially answered" />
          <div className="flex flex-wrap gap-1.5 p-4">
            {[...data.weakCompetencies.fromInterviews.map((x) => [x.concept, x.count] as const), ...data.weakCompetencies.lowMasteryTags.map((x) => [x.tag, x.count] as const)].map(([k, n]) => <Badge key={k} tone="warning">{k} · {n}</Badge>)}
            {!data.weakCompetencies.fromInterviews.length && !data.weakCompetencies.lowMasteryTags.length && <p className="text-xs text-muted">Record missed concepts after interviews to see patterns here.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Conversion & outcomes" />
          <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
            <div><dt className="text-xs text-muted">Application → interview</dt><dd className="text-lg font-semibold tabular-nums">{data.conversion.applicationToInterview ?? '—'}{data.conversion.applicationToInterview !== null && '%'}</dd><dd className="text-xs text-muted">{data.conversion.interviewed}/{data.conversion.applied}</dd></div>
            <div><dt className="text-xs text-muted">Interview → offer</dt><dd className="text-lg font-semibold tabular-nums">{data.conversion.interviewToOffer ?? '—'}{data.conversion.interviewToOffer !== null && '%'}</dd><dd className="text-xs text-muted">{data.conversion.offers}/{data.conversion.interviewed}</dd></div>
            <div className="col-span-2 flex flex-wrap gap-1.5">{Object.entries(data.outcomes).map(([k, v]) => <Badge key={k} tone={k === 'passed' ? 'success' : k === 'failed' ? 'danger' : 'neutral'}>Rounds {k}: {v}</Badge>)}</div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Bot className="h-4 w-4" />Agent & AI tasks needing attention</span>} action={<Link className="text-xs text-accent" href="/tasks">Queue</Link>} />
          {[...data.failedTasks.map((t) => ({ ...t, state: 'failed' as string, routingReason: t.lastError })), ...data.agentTasks].length ? (
            <ul className="divide-y divide-border">
              {[...data.failedTasks.map((t) => ({ ...t, state: 'failed', routingReason: t.lastError })), ...data.agentTasks].slice(0, 8).map((t) => (
                <li key={t.id} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-2"><Link href={`/tasks/${t.id}`} className="truncate text-sm hover:underline">{t.title}</Link><StateBadge value={t.state} /></div>
                  {t.routingReason && <p className="truncate text-xs text-muted">{t.routingReason}</p>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing waiting" description="Tasks that need a coding agent, a review or a retry appear here." />}
        </Card>
        <Card>
          <CardHeader title="Overdue follow-ups & next actions" />
          {data.overdueFollowUps.length + data.overdueActions.length ? (
            <ul className="divide-y divide-border">
              {data.overdueFollowUps.map((f) => <li key={f.id} className="px-4 py-2 text-sm"><Link className="hover:underline" href={`/applications/${f.application.id}`}>{f.title}</Link> <span className="text-xs text-danger">{relTime(f.dueAt)}</span></li>)}
              {data.overdueActions.map((a) => <li key={a.id} className="px-4 py-2 text-sm"><Link className="hover:underline" href={`/applications/${a.id}`}>{a.companyName}: {a.nextAction || 'Next action'}</Link> <span className="text-xs text-danger">{relTime(a.nextActionAt)}</span></li>)}
            </ul>
          ) : <EmptyState title="All caught up" icon={<Repeat className="h-5 w-5" />} />}
        </Card>
      </div>
    </div>
  );
}
