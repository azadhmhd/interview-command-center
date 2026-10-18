'use client';
import { Send } from 'lucide-react';
import Link from 'next/link';
import { AutoApplyNav, ScoreBadge } from '@/components/auto-apply-bits';
import { Badge, Card, EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ATS_LABEL, LeadRow, LeadStatus, STATUS } from '@/lib/autoapply';
import { relTime } from '@/lib/utils';

const COLUMNS: { status: LeadStatus; hint: string }[] = [
  { status: 'READY_FOR_REVIEW', hint: 'Review the kit, then approve' },
  { status: 'APPROVED', hint: 'Waiting for the apply runner or you' },
  { status: 'APPLYING', hint: 'Runner is filling the form' },
  { status: 'NEEDS_ATTENTION', hint: 'Blocked, missing answers or unverified' },
  { status: 'SUBMITTED', hint: 'Confirmed submissions' },
];

export default function Queue() {
  const { data, error, isLoading } = useApi<LeadRow[]>(`/autoapply/leads?status=${COLUMNS.map((c) => c.status).join(',')}`, { refreshInterval: 10_000 });
  return (
    <div>
      <PageHeader title="Apply queue" description="Shortlisted jobs move through review, approval, applying and confirmation." />
      <AutoApplyNav />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={<Send className="h-6 w-6" />} title="Queue is empty" description="Jobs that score above your shortlist threshold land here with a prepared apply kit." /></Card> : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMNS.map((c) => {
            const items = data.filter((l) => l.status === c.status);
            return (
              <div key={c.status} className="w-72 shrink-0">
                <p className="px-1 text-xs font-medium">{STATUS[c.status].label} <span className="text-muted">{items.length}</span></p>
                <p className="mb-2 px-1 text-[11px] text-muted">{c.hint}</p>
                <div className="min-h-24 space-y-2 rounded-lg bg-surface-2 p-2">
                  {items.map((l) => (
                    <Link key={l.id} href={`/auto-apply/leads/${l.id}`}>
                      <Card className="p-3 transition-colors hover:border-accent/40">
                        <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium leading-snug">{l.title}</p><ScoreBadge score={l.fitScore} /></div>
                        <p className="text-xs text-muted">{l.company}{l.location && ` · ${l.location}`}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1"><Badge>{ATS_LABEL[l.atsType] ?? l.atsType}</Badge>{l.kitStatus === 'incomplete' && <Badge tone="warning">kit incomplete</Badge>}{l.autoApproved && <Badge tone="info">auto</Badge>}</div>
                        {l.statusReason && <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">{l.statusReason}</p>}
                        <p className="mt-1 text-[11px] text-muted">{relTime(l.discoveredAt)}</p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
