'use client';
import { Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, useAction } from '@/components/ui';
import { api, setWorkspace, useApi } from '@/lib/api';
import { useMe, useSettings } from '@/lib/hooks';
import { fmtDate } from '@/lib/utils';

const TASK_TYPES = ['course_generation', 'lesson_regeneration', 'answer_evaluation', 'answer_improvement', 'question_extraction', 'resume_extraction', 'resume_draft_import', 'resume_tailoring', 'revision_notes', 'gap_analysis', 'mock_generation', 'company_research'];
const DEFAULT_ROUTE: Record<string, string> = { course_generation: 'auto', company_research: 'agent' };

interface Members { members: { id: string; userId: string; email: string; name: string; role: string }[]; invitations: { id: string; email: string; role: string; expiresAt: string }[] }
interface ShareRow { id: string; resourceType: string; resourceId: string; permission: string; createdAt: string; grantee: { email: string; name: string } }

export default function WorkspaceSettings() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: ws, settings, mutate, isLoading, error } = useSettings();
  const owner = ws?.role === 'OWNER';
  const { data: members, mutate: mutateMembers } = useApi<Members>('/workspaces/current/members');
  const { data: shares, mutate: mutateShares } = useApi<ShareRow[]>('/shares');
  const { data: audit } = useApi<{ id: string; action: string; createdAt: string; resourceType?: string }[]>(owner ? '/workspaces/current/audit' : null);
  const { busy, run } = useAction();
  const [s, setS] = useState<Record<string, string | boolean>>({});
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: '', role: 'VIEWER' });
  const [inviteUrl, setInviteUrl] = useState('');
  const [newWs, setNewWs] = useState('');
  const [del, setDel] = useState({ password: '', confirm: '' });

  useEffect(() => {
    if (!settings) return;
    setS({
      statuses: settings.statuses.join('\n'), roundTypes: settings.roundTypes.map((t) => `${t.key} | ${t.label}`).join('\n'), timezone: settings.timezone,
      quietStart: String(settings.quietHours.start), quietEnd: String(settings.quietHours.end), dailyStudyHours: String(settings.dailyStudyHours),
      milestoneDays: settings.milestoneDays.join(', '), followUpDays: String(settings.followUpDays), learningMode: settings.learningMode, fallbackToAgent: settings.fallbackToAgent, reviewAiOutput: settings.reviewAiOutput,
    });
    setRouting(settings.routing);
  }, [settings]);
  if (isLoading) return <Loading />;
  if (error || !ws || !settings) return <ErrorBox error={error} />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      statuses: String(s.statuses).split('\n').map((x) => x.trim()).filter(Boolean),
      roundTypes: String(s.roundTypes).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([k]) => k).map(([key, lbl]) => ({ key: key.toLowerCase().replace(/[^a-z0-9_]/g, '_'), label: lbl || key })),
      timezone: String(s.timezone), quietHours: { start: Number(s.quietStart), end: Number(s.quietEnd) }, dailyStudyHours: Number(s.dailyStudyHours),
      milestoneDays: String(s.milestoneDays).split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0), followUpDays: Number(s.followUpDays),
      learningMode: !!s.learningMode, fallbackToAgent: !!s.fallbackToAgent, reviewAiOutput: !!s.reviewAiOutput, routing: Object.fromEntries(Object.entries(routing).filter(([, v]) => v)),
    };
    if (await run('save', () => api('/workspaces/current/settings', { method: 'PUT', body }), 'Settings saved')) mutate();
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setS({ ...s, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <PageHeader title="Workspace & members" description={<>{ws.personal ? 'Your private personal workspace' : ws.name} · your role: <strong>{ws.role.toLowerCase()}</strong></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Preferences" description={owner ? undefined : 'Only the owner can change these.'} />
          <form className="space-y-3 p-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Application statuses (one per line)"><Textarea value={String(s.statuses ?? '')} onChange={set('statuses')} className="min-h-48 text-xs" disabled={!owner} /></Field>
              <Field label="Interview round types (key | label)"><Textarea value={String(s.roundTypes ?? '')} onChange={set('roundTypes')} className="min-h-48 font-mono text-xs" disabled={!owner} /></Field>
              <Field label="Timezone (IANA)"><Input value={String(s.timezone ?? '')} onChange={set('timezone')} disabled={!owner} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Quiet hours start"><Input type="number" min={0} max={23} value={String(s.quietStart ?? '')} onChange={set('quietStart')} disabled={!owner} /></Field><Field label="Quiet hours end"><Input type="number" min={0} max={23} value={String(s.quietEnd ?? '')} onChange={set('quietEnd')} disabled={!owner} /></Field></div>
              <Field label="Daily study hours"><Input type="number" step={0.5} min={0.5} value={String(s.dailyStudyHours ?? '')} onChange={set('dailyStudyHours')} disabled={!owner} /></Field>
              <Field label="Milestone days before interview" hint="e.g. 3, 2, 1, 0"><Input value={String(s.milestoneDays ?? '')} onChange={set('milestoneDays')} disabled={!owner} /></Field>
              <Field label="Follow-up reminder after applying (days)"><Input type="number" min={1} value={String(s.followUpDays ?? '')} onChange={set('followUpDays')} disabled={!owner} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.learningMode} onChange={(e) => setS({ ...s, learningMode: e.target.checked })} disabled={!owner} />Learning mode — reveal model answers before attempting</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.fallbackToAgent} onChange={(e) => setS({ ...s, fallbackToAgent: e.target.checked })} disabled={!owner} />When the LLM is unavailable or keeps failing, hand tasks to a coding agent (manual handoff)</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!s.reviewAiOutput} onChange={(e) => setS({ ...s, reviewAiOutput: e.target.checked })} disabled={!owner} /><span>Ask me to approve AI and agent results before a task completes<span className="block text-xs text-muted">Off: results are applied automatically (still labelled as AI/agent-generated). Use Regenerate or Retry anytime to redo something.</span></span></label>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted">Task routing policy</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {TASK_TYPES.map((t) => (
                  <label key={t} className="flex items-center justify-between gap-2 text-xs">{t.replace(/_/g, ' ')}
                    <Select className="h-8 w-36 text-xs" value={routing[t] ?? ''} onChange={(e) => setRouting({ ...routing, [t]: e.target.value })} disabled={!owner}>
                      <option value="">default ({DEFAULT_ROUTE[t] ?? 'llm'})</option><option value="llm">LLM endpoint</option><option value="agent">Coding agent</option><option value="auto">Auto</option>
                    </Select>
                  </label>
                ))}
              </div>
            </details>
            {owner && <div className="flex justify-end"><Button type="submit" loading={busy === 'save'}>Save preferences</Button></div>}
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Members" />
            <ul className="divide-y divide-border">
              {members?.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate">{m.name}</span><span className="block truncate text-xs text-muted">{m.email}</span></span>
                  {owner && m.role !== 'OWNER' ? (
                    <span className="flex items-center gap-1">
                      <Select className="h-7 w-24 text-xs" value={m.role} onChange={async (e) => { await run('role', () => api(`/workspaces/current/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role updated'); mutateMembers(); }}><option value="EDITOR">editor</option><option value="VIEWER">viewer</option></Select>
                      <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={async () => { await run('rm', () => api(`/workspaces/current/members/${m.id}`, { method: 'DELETE' }), 'Member removed'); mutateMembers(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </span>
                  ) : <Badge>{m.role.toLowerCase()}</Badge>}
                </li>
              ))}
            </ul>
            {owner && !ws.personal && (
              <div className="space-y-2 border-t border-border p-3">
                <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run('inv', () => api<{ acceptUrl: string }>('/workspaces/current/invitations', { body: invite }), 'Invitation created'); if (r) { setInviteUrl(r.acceptUrl); setInvite({ email: '', role: 'VIEWER' }); mutateMembers(); } }}>
                  <Input aria-label="Invite email" type="email" required placeholder="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                  <Select aria-label="Invite role" className="w-24" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}><option value="VIEWER">viewer</option><option value="EDITOR">editor</option></Select>
                  <Button type="submit" size="sm" loading={busy === 'inv'}>Invite</Button>
                </form>
                {inviteUrl && <p className="break-all rounded bg-surface-2 p-2 text-xs">Send this link (valid 7 days): <span className="font-mono">{inviteUrl}</span></p>}
                {members?.invitations.map((i) => <p key={i.id} className="flex justify-between text-xs text-muted">{i.email} ({i.role.toLowerCase()}) <button className="text-danger" onClick={async () => { await run('ri', () => api(`/workspaces/current/invitations/${i.id}`, { method: 'DELETE' })); mutateMembers(); }}>revoke</button></p>)}
              </div>
            )}
            {ws.personal && <p className="border-t border-border p-3 text-xs text-muted">Personal workspaces are private. Create a shared workspace below, or share individual records.</p>}
          </Card>

          <Card>
            <CardHeader title="New shared workspace" />
            <form className="flex gap-2 p-3" onSubmit={async (e) => { e.preventDefault(); const w = await run('ws', () => api<{ id: string }>('/workspaces', { body: { name: newWs } }), 'Workspace created'); if (w) { setWorkspace(w.id); location.href = '/settings/workspace'; } }}>
              <Input aria-label="Workspace name" required placeholder="e.g. Mentoring" value={newWs} onChange={(e) => setNewWs(e.target.value)} /><Button type="submit" size="sm" variant="outline">Create</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Records I've shared" />
            <ul className="divide-y divide-border">
              {shares?.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs"><span>{x.resourceType.toLowerCase()} → {x.grantee.email} ({x.permission.toLowerCase()})</span><button className="text-danger" onClick={async () => { await run('rs', () => api(`/shares/${x.id}`, { method: 'DELETE' }), 'Revoked'); mutateShares(); }}>revoke</button></li>)}
              {!shares?.length && <li className="px-4 py-3 text-xs text-muted">Nothing shared.</li>}
            </ul>
          </Card>
        </div>
      </div>

      {owner && audit && (
        <Card>
          <CardHeader title="Audit history" description="Sensitive changes in this workspace" />
          <ul className="max-h-64 divide-y divide-border overflow-y-auto text-xs">{audit.map((a) => <li key={a.id} className="flex justify-between px-4 py-1.5"><span>{a.action}{a.resourceType && ` · ${a.resourceType}`}</span><span className="text-muted">{fmtDate(a.createdAt, true)}</span></li>)}</ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Your data" description={me?.user.email} />
        <div className="flex flex-wrap items-end gap-4 p-4">
          <a href="/api/account/export" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm hover:bg-surface-2"><Download className="h-4 w-4" />Export all my data (JSON)</a>
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run('del', () => api('/account', { method: 'DELETE', body: del }))) { setWorkspace(''); router.push('/register'); } }}>
            <Field label="Password"><Input type="password" required value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></Field>
            <Field label='Type "DELETE"'><Input required value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} className="w-28" /></Field>
            <Button type="submit" variant="danger" disabled={del.confirm !== 'DELETE'} loading={busy === 'del'}>Delete my account permanently</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
