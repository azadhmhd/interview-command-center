'use client';
import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/api';

interface Row { shareId: string; resourceType: string; resourceId: string; permission: string; record?: { companyName?: string; jobTitle?: string; title?: string } }

export default function Shared() {
  const { data, error, isLoading } = useApi<Row[]>('/shared');
  return (
    <div>
      <PageHeader title="Shared with me" description="Records other people explicitly shared with you. Access ends the moment they revoke it." />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={<Share2 className="h-6 w-6" />} title="Nothing shared with you" /></Card> : (
        <Card><ul className="divide-y divide-border">
          {data.map((r) => (
            <li key={r.shareId} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <Link className="hover:underline" href={`/shared/${r.resourceType === 'COURSE' ? 'courses' : 'applications'}/${r.resourceId}`}>{r.record?.title ?? `${r.record?.companyName} — ${r.record?.jobTitle}`}</Link>
              <span className="flex gap-1.5"><Badge>{r.resourceType.toLowerCase()}</Badge><Badge tone={r.permission === 'EDIT' ? 'accent' : 'neutral'}>{r.permission.toLowerCase()}</Badge></span>
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  );
}
