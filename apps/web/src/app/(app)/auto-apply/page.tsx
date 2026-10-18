'use client';
import { ClipboardPaste, Link2, Radar, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AutoApplyNav, LeadStatusBadge, ScoreBadge } from '@/components/auto-apply-bits';
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { ATS_LABEL, LeadRow, salary, STATUS } from '@/lib/autoapply';
import { relTime } from '@/lib/utils';

interface Overview {
  byStatus: Record<string, number>; submittedToday: number; autoSubmit: boolean; dailyApplyCap: number; minAutoApplyScore: number;
  sources: { id: string; name: string; type: string; enabled: boolean; lastSuccessAt?: string; lastError?: string; lastRunAt?: string }[];
  needsAttention: { id: string; title: string; company: string; statusReason?: string }[];
}

export default function Discover() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [minScore, setMinScore] = useState('');
  const [sort, setSort] = useState('score');
  const [urlOpen, setUrlOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [alert, setAlert] = useState('');
  const { busy, run } = useAction();
  const qs = new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...(minScore && { minScore }), sort }).toString();
  const { data: leads, error, isLoading } = useApi<LeadRow[]>(`/autoapply/leads?${qs}`, { keepPreviousData: true });
  const { data: ov } = useApi<Overview>('/autoapply/overview', { refreshInterval: 30_000 });
  const reload = () => refresh('/autoapply');

  const scanAll = async () => {
    for (const s of ov?.sources.filter((x) => x.enabled && !['ALERT_EMAIL', 'MANUAL_URL'].includes(x.type)) ?? []) {
      await run(`scan-${s.id}`, () => api(`/autoapply/sources/${s.id}/run`, { method: 'POST' }));
    }
    reload();
  };

  return (
    <div>
      <PageHeader title="Discover jobs" description="Jobs found on company boards, alert emails and links you paste, ranked by an explained fit score."
        actions={<>
          <Button variant="outline" onClick={() => setUrlOpen(true)}><Link2 className="h-4 w-4" />Paste job URL</Button>
          <Button variant="outline" onClick={() => setAlertOpen(true)}><ClipboardPaste className="h-4 w-4" />Paste alert email</Button>
          <Button onClick={scanAll} loading={!!busy?.startsWith('scan')} disabled={!ov?.sources.length}><RefreshCw className="h-4 w-4" />Scan sources</Button>
        </>} />
      <AutoApplyNav />
      {ov && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Ready for review" value={ov.byStatus.READY_FOR_REVIEW ?? 0} href="/auto-apply/queue" />
          <Stat label="Approved / applying" value={(ov.byStatus.APPROVED ?? 0) + (ov.byStatus.APPLYING ?? 0)} href="/auto-apply/queue" />
          <Stat label="Needs attention" value={ov.byStatus.NEEDS_ATTENTION ?? 0} tone={ov.byStatus.NEEDS_ATTENTION ? 'warning' : undefined} href="/auto-apply/queue" />
          <Stat label="Submitted (24h)" value={ov.submittedToday} hint={`${ov.byStatus.SUBMITTED ?? 0} total`} />
          <Stat label="Auto-submit" value={ov.autoSubmit ? 'On' : 'Off'} tone={ov.autoSubmit ? 'success' : undefined} hint={ov.autoSubmit ? `score ≥ ${ov.minAutoApplyScore}, ≤ ${ov.dailyApplyCap}/day` : 'You approve each job'} href="/auto-apply/settings" />
        </div>
      )}
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-4">
        <Input aria-label="Search" placeholder="Search title, company, location" value={q} onChange={(e) => setQ(e.target.value)} className="sm:col-span-2" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SHORTLISTED,READY_FOR_REVIEW">Shortlisted & ready</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Minimum score" value={minScore} onChange={(e) => setMinScore(e.target.value)}><option value="">Any score</option><option value="60">60+</option><option value="75">75+</option></Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="score">Best fit</option><option value="recent">Newest</option></Select>
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading && !leads ? <Loading /> : !leads?.length ? (
        <Card><EmptyState icon={<Radar className="h-6 w-6" />} title="No jobs yet" description="Add company boards under Job sources, paste a job link, or paste a LinkedIn / Bayt / GulfTalent / Naukrigulf job-alert email."
          action={<Link className="text-sm text-accent underline" href="/auto-apply/sources">Add a job source</Link>} /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Fit</th><th className="font-medium">Job</th><th className="font-medium">Status</th><th className="font-medium">Source</th><th className="font-medium">Salary</th><th className="pr-4 font-medium">Found</th></tr></thead>
            <tbody className="divide-y divide-border">
              {leads.map((l) => (
                <tr key={l.id} className={`cursor-pointer hover:bg-surface-2 ${l.blockers.length ? 'opacity-60' : ''}`} onClick={() => router.push(`/auto-apply/leads/${l.id}`)}>
                  <td className="px-4 py-2.5"><ScoreBadge score={l.fitScore} /></td>
                  <td className="py-2.5">
                    <Link href={`/auto-apply/leads/${l.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{l.title}</Link>
                    <p className="text-xs text-muted">{l.company}{l.location && ` · ${l.location}`}{l.remote && ' · Remote'}</p>
                    {!!l.blockers.length && <p className="text-xs text-warning">{l.blockers[0]}</p>}
                  </td>
                  <td><LeadStatusBadge status={l.status} />{l.autoApproved && <Badge tone="info" className="ml-1">auto</Badge>}</td>
                  <td className="text-xs"><Badge>{ATS_LABEL[l.atsType] ?? l.atsType}</Badge><p className="mt-0.5 text-muted">{l.discoveredVia.slice(0, 2).join(', ')}</p></td>
                  <td className="text-xs">{salary(l) ?? <span className="text-muted">—</span>}</td>
                  <td className="pr-4 text-xs text-muted">{relTime(l.publishedAt ?? l.discoveredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={urlOpen} onClose={() => setUrlOpen(false)} title="Add a job from a link">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run('url', () => api<{ lead: { id: string } }>('/autoapply/import/url', { body: { url } }), 'Job added and scored'); if (r) { setUrlOpen(false); setUrl(''); router.push(`/auto-apply/leads/${r.lead.id}`); } }}>
          <Field label="Job posting URL" hint="Any site. Company boards and pages with structured job data work best; some sites (e.g. LinkedIn) block automated reading, so paste the alert email instead."><Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://job-boards.greenhouse.io/acme/jobs/123" /></Field>
          <div className="flex justify-end"><Button type="submit" loading={busy === 'url'}>Add job</Button></div>
        </form>
      </Dialog>
      <Dialog open={alertOpen} onClose={() => setAlertOpen(false)} title="Paste a job-alert email" wide>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run('alert', () => api<{ found: number; created: number }>('/autoapply/import/alert', { body: { content: alert } })); if (r) { setAlertOpen(false); setAlert(''); reload(); } }}>
          <p className="text-xs text-muted">Open a LinkedIn, Bayt, GulfTalent or Naukrigulf alert email, view its source (Gmail: ⋮ → Show original) or copy the whole message, and paste it here. Job links, titles and companies are extracted locally; nothing is fetched from those sites.</p>
          <Textarea required value={alert} onChange={(e) => setAlert(e.target.value)} className="min-h-60 font-mono text-xs" placeholder="Paste the email (HTML source or plain text)…" />
          <div className="flex justify-end"><Button type="submit" loading={busy === 'alert'}>Import jobs</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
