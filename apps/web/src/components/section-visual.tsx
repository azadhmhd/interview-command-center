'use client';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ArrayRow, Frame, GraphView, GridView, Tone } from '@/lib/sections';
import { VISUALS } from '@/lib/sections';
import { cn } from '@/lib/utils';
import { Button, Select } from './ui';

const CELL: Record<Tone, string> = {
  active: 'border-accent bg-accent text-accent-fg',
  done: 'border-success/40 bg-success-soft text-success',
  mark: 'border-warning/40 bg-warning-soft text-warning',
  dim: 'border-transparent bg-muted/25 text-muted',
};
const FILL: Record<Tone, string> = { active: 'var(--accent)', done: 'var(--success-soft)', mark: 'var(--warning-soft)', dim: 'var(--surface-2)' };
const STROKE: Record<Tone, string> = { active: 'var(--accent)', done: 'var(--success)', mark: 'var(--warning)', dim: 'var(--border)' };

function ArrayView({ row }: { row: ArrayRow }) {
  return (
    <div className="flex items-start gap-2">
      {row.label && <span className="w-12 shrink-0 pt-6 text-right text-[11px] text-muted">{row.label}</span>}
      <div className="flex gap-1">
        {row.values.map((v, i) => {
          const inRange = row.range && i >= row.range[0] && i <= row.range[1];
          const tags = Object.entries(row.pointers ?? {}).filter(([, at]) => at === i).map(([name]) => name);
          return (
            <div key={i} className="flex w-10 flex-col items-center">
              <span className="text-[10px] text-muted">{i}</span>
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-md border font-mono text-sm transition-colors', row.tones?.[i] ? CELL[row.tones[i]] : inRange ? 'border-accent/50 bg-accent-soft' : 'border-border bg-surface')}>{v}</span>
              <span className="h-4 text-[10px] font-semibold text-accent">{tags.join(' ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Grid({ grid }: { grid: GridView }) {
  return (
    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${grid.cells[0]?.length ?? 1}, 2.5rem)` }}>
      {grid.cells.flatMap((row, r) => row.map((v, c) => {
        const tone = grid.tones?.[`${r},${c}`];
        return <span key={`${r},${c}`} className={cn('flex h-10 w-10 items-center justify-center rounded-md border font-mono text-sm transition-colors', tone ? CELL[tone] : 'border-border bg-surface')}>{v}</span>;
      }))}
    </div>
  );
}

function Graph({ g }: { g: GraphView }) {
  const S = 64, P = 30;
  const xs = g.nodes.map((n) => n.x), ys = g.nodes.map((n) => n.y);
  const minX = Math.min(...xs, 0), w = (Math.max(...xs, 0) - minX) * S + 2 * P, h = Math.max(...ys, 0) * S + 2 * P;
  const at = (id: string) => { const n = g.nodes.find((x) => x.id === id)!; return { x: (n.x - minX) * S + P, y: n.y * S + P }; };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" style={{ maxWidth: w, maxHeight: 320 }} role="img" aria-label="Diagram of the current step">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker></defs>
      {g.edges.map((e) => {
        const a = at(e.from), b = at(e.to), d = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = 19 / d;
        return (
          <g key={`${e.from}-${e.to}`}>
            <line x1={a.x + (b.x - a.x) * k} y1={a.y + (b.y - a.y) * k} x2={b.x - (b.x - a.x) * k} y2={b.y - (b.y - a.y) * k} stroke={e.tone ? STROKE[e.tone] : 'var(--border)'} strokeWidth={e.tone ? 2.5 : 1.5} markerEnd={e.directed ? 'url(#arrow)' : undefined} />
            {e.label && <text x={(a.x + b.x) / 2 - ((b.y - a.y) / d) * 9} y={(a.y + b.y) / 2 + ((b.x - a.x) / d) * 9 + 4} textAnchor="middle" fontSize="11" fill="var(--muted)">{e.label}</text>}
          </g>
        );
      })}
      {g.nodes.map((n) => {
        const { x, y } = at(n.id), tone = g.tones?.[n.id];
        return (
          <g key={n.id} style={{ transition: 'transform .3s' }}>
            <circle cx={x} cy={y} r={17} fill={tone ? FILL[tone] : 'var(--surface)'} stroke={tone ? STROKE[tone] : 'var(--border)'} strokeWidth={1.5} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, monospace" fill={tone === 'active' ? 'var(--accent-fg)' : 'var(--text)'}>{n.label}</text>
            {n.tag && <text x={x} y={y - 23} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--accent)">{n.tag}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function FrameView({ f }: { f: Frame }) {
  return (
    <div className="space-y-3">
      {f.arrays?.map((row, i) => <div key={i} className="overflow-x-auto pb-1"><ArrayView row={row} /></div>)}
      {f.grid && <div className="overflow-x-auto"><Grid grid={f.grid} /></div>}
      {f.graph && <Graph g={f.graph} />}
      {f.intervals && (
        <div className="space-y-1">
          {f.intervals.lanes.map((lane, i) => (
            <div key={lane} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">{lane}</span>
              <div className="relative h-6 flex-1 rounded bg-surface-2">
                {f.intervals!.bars.filter((b) => b.lane === i).map((b) => (
                  <span key={`${b.start}-${b.end}`} className={cn('absolute top-0.5 h-5 rounded border transition-all', b.tone ? CELL[b.tone] : 'border-border bg-surface')}
                    style={{ left: `${(b.start / f.intervals!.max) * 100}%`, width: `${((b.end - b.start) / f.intervals!.max) * 100}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {f.chips?.map((c) => (
        <div key={c.label} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">{c.label}:</span>
          {c.items.length ? c.items.map((x, i) => <span key={i} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono">{x}</span>) : <span className="text-muted">(empty)</span>}
        </div>
      ))}
      {f.vars && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {Object.entries(f.vars).map(([k, v]) => <span key={k} className="rounded bg-surface-2 px-2 py-0.5 font-mono"><span className="text-muted">{k} =</span> {v}</span>)}
        </div>
      )}
    </div>
  );
}

/** Step-through player for a pattern's visual: play, pause, step and change speed. */
export function SectionVisual({ topic }: { topic: string }) {
  const visual = VISUALS[topic];
  const frames = useMemo(() => visual?.frames() ?? [], [visual]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  useEffect(() => {
    if (!playing) return;
    if (i >= frames.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI(i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, i, speed, frames.length]);
  if (!visual || !frames.length) return null;
  const f = frames[i];
  return (
    <div className="space-y-3">
      <div className="min-h-40 rounded-lg border border-border bg-bg p-4"><FrameView f={f} /></div>
      <p className="min-h-10 text-sm" aria-live="polite"><span className="mr-2 text-xs text-muted">Step {i + 1}/{frames.length}</span>{f.note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Restart" onClick={() => { setI(0); setPlaying(false); }}><RotateCcw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" aria-label="Previous step" disabled={!i} onClick={() => { setPlaying(false); setI(i - 1); }}><SkipBack className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => { if (i >= frames.length - 1) setI(0); setPlaying(!playing); }}>{playing ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Play</>}</Button>
        <Button size="sm" variant="outline" aria-label="Next step" disabled={i >= frames.length - 1} onClick={() => { setPlaying(false); setI(i + 1); }}><SkipForward className="h-3.5 w-3.5" /></Button>
        <input type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Step" className="min-w-24 flex-1 accent-[var(--accent)]" />
        <Select aria-label="Speed" value={String(speed)} onChange={(e) => setSpeed(Number(e.target.value))} className="w-auto">
          <option value="2000">Slow</option><option value="1200">Normal</option><option value="500">Fast</option>
        </Select>
      </div>
    </div>
  );
}
