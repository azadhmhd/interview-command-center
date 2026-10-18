'use client';
import Link from 'next/link';
import { STATUS, LeadStatus, scoreTone } from '@/lib/autoapply';
import { Badge } from './ui';

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

// static class names (Tailwind only generates classes it can see in the source)
const SCORE_CLASS = { success: 'bg-success-soft text-success', info: 'bg-info-soft text-info', warning: 'bg-warning-soft text-warning', neutral: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-accent', danger: 'bg-danger-soft text-danger' } as const;

export function ScoreBadge({ score }: { score?: number | null }) {
  return <span className={`inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${SCORE_CLASS[scoreTone(score)]}`} title="Fit score (0-100)">{score ?? '—'}</span>;
}

export function AutoApplyNav() {
  return (
    <p className="mb-4 text-xs text-muted">
      Auto Apply is separate from your <Link className="text-accent underline" href="/applications">application tracker</Link>. Jobs move there only when you click “Move to tracker”.
    </p>
  );
}
