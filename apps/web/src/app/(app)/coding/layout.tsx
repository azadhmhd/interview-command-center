'use client';
import { CheckCircle2, Circle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/api';
import type { Section } from '@/lib/sections';
import { cn } from '@/lib/utils';

const DOT = { easy: 'bg-success', medium: 'bg-warning', hard: 'bg-danger' } as const;
const HIDDEN_KEY = 'coding.tree.hidden';

function Tree({ sections, path }: { sections: Section[]; path: string }) {
  const ref = useRef<HTMLElement>(null);
  // keep the current problem or section in view when navigating
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }); }, [path]);
  return (
    <nav ref={ref} aria-label="Sections" className="space-y-0.5 text-sm">
      <Link href="/coding" aria-current={path === '/coding' ? 'page' : undefined} className={cn('block rounded-md px-2 py-1.5 font-medium', path === '/coding' ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2')}>All sections</Link>
      {sections.map((s, i) => {
        const overview = path === `/coding/sections/${s.slug}`;
        const here = overview || s.problems.some((p) => path === `/coding/${p.slug}`);
        const done = s.problems.filter((p) => p.done).length;
        return (
          // key on `here` so the section re-opens when you navigate into it, while staying user-toggleable
          <details key={`${s.slug}-${here}`} open={here} className="group">
            <summary className={cn('flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5', here ? 'font-medium text-accent' : 'hover:bg-surface-2')}>
              <span className="text-muted transition-transform group-open:rotate-90">›</span>
              <span className="flex-1 truncate">{i + 1}. {s.title}</span>
              <span className={cn('text-[11px] tabular-nums', done === s.problems.length ? 'text-success' : 'text-muted')}>{done}/{s.problems.length}</span>
            </summary>
            <div className="ml-4 space-y-0.5 border-l border-border pl-2">
              <Link href={`/coding/sections/${s.slug}`} aria-current={overview ? 'page' : undefined} className={cn('block rounded-md px-2 py-1', overview ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text')}>Overview</Link>
              {s.problems.map((p) => {
                const current = path === `/coding/${p.slug}`;
                return (
                  <Link key={p.slug} href={`/coding/${p.slug}`} aria-current={current ? 'page' : undefined} title={`${p.title} (${p.difficulty})`}
                    className={cn('flex items-center gap-1.5 rounded-md px-2 py-1', current ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-text')}>
                    {p.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-label="Not done" />}
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[p.difficulty])} aria-label={p.difficulty} />
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

/** Coding practice: the section and problem tree beside every page (a collapsible list on small screens). */
export default function CodingLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data } = useApi<Section[]>('/coding/sections');
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(HIDDEN_KEY) === '1'); } catch { /* storage blocked: keep the default */ } }, []);
  const toggle = () => { setHidden(!hidden); try { localStorage.setItem(HIDDEN_KEY, hidden ? '0' : '1'); } catch { /* not remembered */ } };
  return (
    <div className={cn('grid gap-4', !hidden && 'lg:grid-cols-[16rem_minmax(0,1fr)]')}>
      {data && (
        <>
          {!hidden && (
            <aside className="hidden lg:block">
              <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">Problems</span>
                  <button type="button" onClick={toggle} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Hide the problem list" title="Hide the problem list"><PanelLeftClose className="h-4 w-4" /></button>
                </div>
                <div className="overflow-y-auto p-2"><Tree sections={data} path={path} /></div>
              </div>
            </aside>
          )}
          <details className="rounded-lg border border-border bg-surface p-2 lg:hidden">
            <summary className="cursor-pointer px-2 py-1 text-sm font-medium">All sections and problems</summary>
            <div className="mt-2"><Tree sections={data} path={path} /></div>
          </details>
        </>
      )}
      <div className={cn('min-w-0', !hidden && 'lg:col-start-2')}>
        {hidden && (
          <button type="button" onClick={toggle} className="mb-3 hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text lg:inline-flex">
            <PanelLeftOpen className="h-3.5 w-3.5" />Show the problem list
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
