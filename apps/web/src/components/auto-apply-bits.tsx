'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, refresh } from '@/lib/api';
import { STATUS, LeadStatus, scoreTone } from '@/lib/autoapply';
import { Badge, useToast } from './ui';

/** Scan / search a source now and report the outcome. Long searches finish in the background. */
export function useScan() {
  const toast = useToast();
  const [scanning, setScanning] = useState<string | null>(null);
  const scan = async (id: string, quiet = false) => {
    setScanning(id);
    try {
      const r = await api<{ found: number; created: number; error?: string; running?: boolean }>(`/autoapply/sources/${id}/run`, { method: 'POST' });
      if (r.running) {
        if (!quiet) toast('Still searching in the background. New jobs will appear here as they are scored.');
        for (const ms of [20_000, 45_000, 90_000]) setTimeout(() => refresh('/autoapply'), ms);
      } else if (r.error) toast(r.error, 'danger');
      else if (!quiet) toast(`${r.found} jobs found, ${r.created} new`);
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setScanning(null);
      refresh('/autoapply');
    }
  };
  return { scanning, scan };
}

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
