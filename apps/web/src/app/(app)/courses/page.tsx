'use client';
import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorBox, Loading, PageHeader, Progress } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate, relTime } from '@/lib/utils';

interface CourseRow { id: string; title: string; mode: string; generator: string; updatedAt: string; lessonCount: number; completed: number; totalMinutes: number; round?: { type: string; scheduledAt?: string; title?: string }; application?: { companyName: string; jobTitle: string } }

export default function Courses() {
  const { data, error, isLoading } = useApi<CourseRow[]>('/courses');
  return (
    <div>
      <PageHeader title="Preparation courses" description="Round-specific crash courses built from your job description, history and weaknesses." />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No courses yet" description="Open an interview round and click “Prepare for this round”." /></Card> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`}>
              <Card className="h-full p-4 transition-colors hover:border-accent/40">
                <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{c.title}</p><Badge tone={c.generator === 'deterministic' ? 'neutral' : 'accent'}>{c.generator === 'deterministic' ? 'baseline' : c.generator}</Badge></div>
                <p className="mt-1 text-xs text-muted">{c.application?.jobTitle} · {c.mode.toLowerCase()} · ~{Math.round(c.totalMinutes / 60)}h{c.round?.scheduledAt && ` · interview ${relTime(c.round.scheduledAt)}`}</p>
                <div className="mt-3 flex items-center gap-2"><Progress value={(c.completed / Math.max(1, c.lessonCount)) * 100} /><span className="text-xs tabular-nums text-muted">{c.completed}/{c.lessonCount}</span></div>
                <p className="mt-2 text-[11px] text-muted">Updated {fmtDate(c.updatedAt)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
