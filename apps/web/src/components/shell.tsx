'use client';
import {
  BarChart3, Bot, Briefcase, CalendarClock, Code2, FileText, GraduationCap, LayoutDashboard, Library, LogOut, Menu, MessageSquarePlus, Mic, Radar, Repeat, Rocket, Satellite, Send, Settings, Share2, SlidersHorizontal, Sparkles, Target, User, Users, X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, getWorkspace, refresh, setWorkspace, useApi } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { QuickCapture } from './quick-capture';
import { Badge, Button, Select } from './ui';

const NAV = [
  { group: 'Track', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/applications', label: 'Applications', icon: Briefcase },
    { href: '/resumes', label: 'Resume builder', icon: FileText },
    { href: '/interviews', label: 'Interview timeline', icon: CalendarClock },
  ] },
  { group: 'Prepare', items: [
    { href: '/courses', label: 'Preparation courses', icon: GraduationCap },
    { href: '/mock', label: 'Mock interviews', icon: Mic },
    { href: '/coding', label: 'Coding practice', icon: Code2 },
    { href: '/questions', label: 'Question library', icon: Library },
    { href: '/revision', label: 'Revision queue', icon: Repeat },
  ] },
  { group: 'Auto Apply', items: [
    { href: '/auto-apply/mission', label: 'Mission control', icon: Satellite },
    { href: '/auto-apply', label: 'Discover jobs', icon: Radar, exact: true },
    { href: '/auto-apply/queue', label: 'Apply queue', icon: Send },
    { href: '/auto-apply/sources', label: 'Job sources', icon: Rocket },
    { href: '/auto-apply/recruiters', label: 'Recruiters', icon: Users },
    { href: '/auto-apply/settings', label: 'Auto Apply settings', icon: SlidersHorizontal },
  ] },
  { group: 'Automation', items: [
    { href: '/tasks', label: 'Agent task queue', icon: Bot },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  ] },
  { group: 'Settings', items: [
    { href: '/settings/profile', label: 'Profile & CVs', icon: User },
    { href: '/settings/ai', label: 'AI configuration', icon: Sparkles },
    { href: '/settings/workspace', label: 'Workspace & members', icon: Settings },
    { href: '/shared', label: 'Shared with me', icon: Share2 },
  ] },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const { data: tasks } = useApi<{ id: string }[]>('/tasks?state=ready_for_agent,awaiting_review,failed', { refreshInterval: 30000 });
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState(false);
  const ws = me?.workspaceId ?? getWorkspace();

  const nav = (
    // logo, workspace and Quick capture stay put; only the links scroll when they are taller than the screen
    <nav className="flex h-full flex-col gap-4 p-3" aria-label="Main">
      <div className="flex shrink-0 items-center gap-2 px-2 pt-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg"><Target className="h-4 w-4" /></span>
        <span className="text-sm font-semibold leading-tight">Interview<br />Command Center</span>
      </div>
      {me && me.workspaces.length > 1 && (
        <Select aria-label="Workspace" value={ws} onChange={(e) => { setWorkspace(e.target.value); refresh('/'); router.refresh(); location.reload(); }}>
          {me.workspaces.map((w) => <option key={w.id} value={w.id}>{w.personal ? 'Personal' : w.name} ({w.role.toLowerCase()})</option>)}
        </Select>
      )}
      <Button onClick={() => setCapture(true)} className="w-full shrink-0 justify-start"><MessageSquarePlus className="h-4 w-4" />Quick capture</Button>
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 [scrollbar-width:thin]">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{g.group}</p>
          {g.items.map((i) => {
            const active = path === i.href || (!('exact' in i && i.exact) && path.startsWith(i.href + '/')) || (i.href === '/auto-apply' && path.startsWith('/auto-apply/leads'));
            return (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
                className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors', active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-surface-2 hover:text-text')}>
                <i.icon className="h-4 w-4 shrink-0" />{i.label}
                {i.href === '/tasks' && !!tasks?.length && <Badge tone="warning" className="ml-auto">{tasks.length}</Badge>}
              </Link>
            );
          })}
        </div>
      ))}
      </div>
      <div className="shrink-0 border-t border-border pt-3">
        <p className="truncate px-2 text-xs font-medium">{me?.user.name}</p>
        <p className="truncate px-2 text-xs text-muted">{me?.user.email}</p>
        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setWorkspace(''); router.push('/login'); }}>
          <LogOut className="h-3.5 w-3.5" />Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-surface lg:block">{nav}</aside>
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
        <span className="text-sm font-semibold">Interview Command Center</span>
        <Button variant="ghost" size="icon" onClick={() => setCapture(true)} aria-label="Quick capture"><MessageSquarePlus className="h-5 w-5" /></Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface">
            <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></Button>
            {nav}
          </aside>
        </div>
      )}
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <QuickCapture open={capture} onClose={() => setCapture(false)} />
    </div>
  );
}
