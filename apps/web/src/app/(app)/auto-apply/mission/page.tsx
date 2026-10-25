'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import type { LeadRow } from '@/lib/autoapply';
import type { Task } from '@/lib/types';
import { relTime } from '@/lib/utils';

interface Overview {
  byStatus: Record<string, number>; submittedToday: number; autoSubmit: boolean; dailyApplyCap: number;
  sources: { id: string; name: string; type: string; enabled: boolean; lastRunAt?: string | null; lastSuccessAt?: string | null; lastError?: string | null }[];
  needsAttention: { id: string; title: string; company: string; statusReason?: string | null }[];
}

/**
 * Mission control as a top-down pixel-art office. Each room is one real Auto Apply stage (discovery + duplicate guard,
 * scoring, CV tailoring, applying, evidence, your own desk) staffed by a robot whose speech bubble is its live status.
 * Nothing is staged: a robot works only while its stage has running work and sleeps otherwise; rooms with nothing running
 * go dark. When a poll shows a real handoff (a job sent for scoring, a job sent for tailoring, a tailored CV completed, a
 * submission, a job blocked on you), the sender walks that document to the receiver's desk and back. A rise in today's
 * submissions sets off confetti. Plain SVG + SMIL/CSS, no game engine; dark by design.
 */
const CSS = `
.of{background:radial-gradient(1200px 700px at 50% 30%,#13254a 0%,#0a1328 45%,#050913 100%);color:#dbeafe}
.of-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
.of-glow{text-shadow:0 0 18px rgba(125,211,252,.45)}
.of-panel{background:linear-gradient(180deg,rgba(15,30,60,.86),rgba(8,16,34,.86));border:1px solid rgba(125,211,252,.22);box-shadow:0 10px 40px rgba(2,8,23,.6),inset 0 1px 0 rgba(255,255,255,.04)}
.px-work{animation:px-bob .6s steps(1) infinite}
.px-jump{animation:px-jump .5s steps(3) infinite}
.px-fl{animation:px-step .36s steps(1) infinite}
.px-fr{animation:px-step .36s steps(1) infinite .18s}
.px-blink{animation:px-blink 1s steps(1) infinite}
.px-z{animation:px-z 2.4s linear infinite}
.of-bubble{animation:of-pop .35s ease-out}
.of-bubble:after{content:"";position:absolute;left:var(--tail,18px);border:6px solid transparent}
.of-down:after{bottom:-6px;border-bottom:0;border-top-color:rgba(255,255,255,.95)}
.of-up:after{top:-6px;border-top:0;border-bottom-color:rgba(255,255,255,.95)}
.of-confetti{position:absolute;left:50%;top:30%;width:8px;height:8px;animation:of-confetti 2.2s cubic-bezier(.2,.7,.4,1) forwards}
.of-toast{animation:of-pop .5s cubic-bezier(.3,1.6,.5,1)}
.of-live{animation:of-pulse 1.8s infinite}
.of-ticker{animation:of-ticker 40s linear infinite}
@keyframes px-bob{50%{transform:translateY(-1px)}}
@keyframes px-jump{50%{transform:translateY(-5px)}}
@keyframes px-step{50%{transform:translateY(-1px)}}
@keyframes px-blink{50%{opacity:.15}}
@keyframes px-z{0%{transform:translate(0,0);opacity:0}30%{opacity:1}100%{transform:translate(5px,-10px);opacity:0}}
@keyframes of-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes of-confetti{0%{transform:translate(0,0) rotate(0);opacity:1}55%{transform:translate(var(--x),var(--y)) rotate(var(--r));opacity:1}100%{transform:translate(var(--x),calc(var(--y) + 160px)) rotate(calc(var(--r) * 2));opacity:0}}
@keyframes of-pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.7)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
@keyframes of-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.of *,.of *:after{animation:none!important}.of-confetti{display:none}}
`;

// Our own 12×15 robot, front and back. a antenna · o stem · H head · V visor · E eyes · d dark · b arms · B body · c chest light
const FRONT = [
  '.....aa.....', '.....oo.....', '..HHHHHHHH..', '.HHHHHHHHHH.', '.HVVVVVVVVH.', '.HVEEVVEEVH.', '.HVVVVVVVVH.', '.HHHHHHHHHH.',
  '..dddddddd..', '.bBBBBBBBBb.', '.bBBBccBBBb.', '.bBBBBBBBBb.', '..BBBBBBBB..', '..dd....dd..', '..dd....dd..',
];
const BACK = [
  '.....aa.....', '.....oo.....', '..HHHHHHHH..', '.HHHHHHHHHH.', '.HHHHHHHHHH.', '.HHHddddHHH.', '.HHHHHHHHHH.', '.HHHHHHHHHH.',
  '..dddddddd..', '.bBBBBBBBBb.', '.bBBBBBBBBb.', '.bBBBddBBBb.', '..BBBBBBBB..', '..dd....dd..', '..dd....dd..',
];

/** Draws a pixel grid as merged horizontal runs, feet origin at (0,0). Rows 13+ are the feet and step while walking. */
function Sprite({ grid, pal, walk }: { grid: string[]; pal: Record<string, string>; walk?: boolean }) {
  const rects: ReactNode[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let w = 1;
      while (row[x + w] === c) w++;
      if (c !== '.') rects.push(<rect key={`${x}-${y}`} x={x - 6} y={y - 15} width={w} height="1" fill={pal[c]} className={walk && y >= 13 ? (x < 6 ? 'px-fl' : 'px-fr') : undefined} />);
      x += w;
    }
  });
  return <g filter="url(#px-outline)">{rects}</g>;
}

type Pt = [number, number];
type Crew = 'scout' | 'sift' | 'stitch' | 'pilot';
type Dest = 'sift' | 'stitch' | 'pilot' | 'post' | 'you';
type Trip = { key: number; way: RouteKey; from: Crew; to: Dest; label: string; extra: number };


// Delivery routes from the sender's seat, out through the doors (x 64/192/320) and the hallway, to the receiver's desk.
const ROUTES = {
  'scout>sift': [[44, 72], [44, 92], [64, 92], [64, 122], [192, 122], [192, 96], [234, 96], [234, 70], [214, 70]],
  'sift>stitch': [[196, 66], [234, 66], [234, 96], [192, 96], [192, 122], [320, 122], [320, 92], [312, 80]],
  'stitch>pilot': [[296, 78], [296, 92], [320, 92], [320, 160], [292, 160], [292, 206], [322, 206]],
  'pilot>post': [[335, 206], [286, 206], [286, 156], [320, 156], [320, 134], [192, 134], [192, 160], [220, 160], [220, 212], [194, 212]],
  'pilot>you': [[335, 206], [286, 206], [286, 156], [320, 156], [320, 134], [64, 134], [64, 160], [100, 180]],
} satisfies Partial<Record<`${Crew}>${Dest}`, Pt[]>>;
type RouteKey = keyof typeof ROUTES;
const SPEED = 45, PAUSE = 1.6; // map units per second; seconds spent handing over
const walkS = (r: Pt[]) => r.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - r[i][0], p[1] - r[i][1]), 0) / SPEED;
const tripS = (r: Pt[]) => 2 * walkS(r) + PAUSE;
const DEST: Record<Dest, string> = { sift: 'SIFT', stitch: 'STITCH', pilot: 'PILOT', post: 'POST', you: 'your desk' };

/** One delivery, started on mount: walk the route holding the document, hand it over, walk back empty-handed. */
function Walker({ route, pal, doc }: { route: Pt[]; pal: Record<string, string>; doc: string }) {
  const id = `trip${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = useRef<SVGAnimateMotionElement>(null);
  useLayoutEffect(() => ref.current?.beginElement(), []);
  const walk = walkS(route), total = tripS(route);
  const d = `M${[...route, ...route.slice(0, -1).reverse()].map((p) => p.join(' ')).join(' L')}`;
  const handedOver = ((walk + PAUSE) / total).toFixed(3);
  return (
    <g>
      <animateMotion ref={ref} id={id} begin="indefinite" dur={`${total}s`} fill="freeze" path={d} calcMode="linear" keyPoints="0;0.5;0.5;1" keyTimes={`0;${(walk / total).toFixed(3)};${handedOver};1`} />
      <rect x="-5" y="-1" width="10" height="2" fill="#000" opacity=".3" />
      <Sprite grid={FRONT} pal={pal} walk />
      <g>
        <animate attributeName="opacity" begin={`${id}.begin`} dur={`${total}s`} fill="freeze" values="1;0" keyTimes={`0;${handedOver}`} calcMode="discrete" />
        <rect x="-3" y="-23" width="7" height="8" fill={doc} stroke="#0b1020" strokeWidth=".6" /><rect x="-2" y="-21" width="5" height="1" fill="#94a3b8" /><rect x="-2" y="-19" width="4" height="1" fill="#94a3b8" />
      </g>
    </g>
  );
}

type AgentProps = { seat: Pt; trip?: { key: number; route: Pt[] }; busy: boolean; color: string; dark: string; party: boolean; still: boolean; front?: boolean; doc?: string };

/** A robot at its seat: working (bobbing at the desk), asleep, cheering, or out on a delivery. */
function Agent({ seat, trip, busy, color, dark, party, still, front, doc = '#f8fafc' }: AgentProps) {
  const pal = { a: party ? '#fbbf24' : busy || trip ? '#4ade80' : '#64748b', o: '#94a3b8', H: color, V: '#0f172a', E: busy || party || trip ? '#7dd3fc' : '#475569', d: '#1e293b', b: color, B: dark, c: '#4ade80' };
  if (trip && !still) return <Walker key={trip.key} route={trip.route} pal={pal} doc={doc} />;
  return (
    <g transform={`translate(${seat[0]} ${seat[1]})`}>
      <rect x="-5" y="-1" width="10" height="2" fill="#000" opacity=".3" />
      <g className={party ? 'px-jump' : busy ? 'px-work' : ''}><Sprite grid={party || front ? FRONT : BACK} pal={pal} /></g>
      {!busy && !party && !trip && <text x="4" y="-15" fontSize="6" fill="#cbd5e1" className="px-z of-mono">z</text>}
    </g>
  );
}

/** Calls `onNew` with the ids that appeared since the previous poll; the first poll is only the baseline. */
function useNewIds(ids: string[] | undefined, onNew: (fresh: string[]) => void) {
  const seen = useRef<Set<string> | null>(null);
  const key = ids?.join();
  useEffect(() => {
    if (!ids) return;
    const prev = seen.current;
    seen.current = new Set(ids);
    const fresh = prev ? ids.filter((id) => !prev.has(id)) : [];
    if (fresh.length) onNew(fresh);
  }, [key]); // ids/onNew are read fresh whenever the id list changes
}

// Map: 384×256 units, three rooms on top, a hallway, three rooms below. Doors are 24 wide at each room's centre.
const W = 384, H = 256;
const ROOMS = [
  { key: 'scout', name: 'SCOUTING DESK', href: '/auto-apply/sources', x: 0, y: 0, floor: 'px-carpet' },
  { key: 'sift', name: 'SCORING LAB', href: '/auto-apply', x: 128, y: 0, floor: 'px-lab' },
  { key: 'stitch', name: 'CV STUDIO', href: '/resumes', x: 256, y: 0, floor: 'px-wood' },
  { key: 'you', name: 'YOUR OFFICE', href: '/auto-apply/queue', x: 0, y: 144, floor: 'px-wood' },
  { key: 'post', name: 'MAILROOM', href: '/applications', x: 128, y: 144, floor: 'px-concrete' },
  { key: 'pilot', name: 'DISPATCH DESK', href: '/auto-apply/queue', x: 256, y: 144, floor: 'px-green' },
] as const;
type RoomKey = (typeof ROOMS)[number]['key'];
const hwall = (y: number) => [[0, 52], [76, 180], [204, 308], [332, W]].map(([a, b]) => <rect key={`${y}-${a}`} x={a} y={y} width={b - a} height="4" />);

/** HTML speech bubble (so text wraps); hidden on phones, where the status list under the map takes over. */
function Bubble({ who, text, up, tail }: { who: string; text: string; up?: boolean; tail?: string }) {
  return (
    <div key={text} className={`of-bubble relative hidden max-w-[88%] rounded-lg bg-white/95 px-2 py-1 text-[10px] leading-tight text-slate-900 shadow-lg sm:block lg:text-[11px] ${up ? 'of-up' : 'of-down'}`} style={{ ['--tail' as string]: tail }}>
      <b className="of-mono text-[9px]">{who}</b> <span className="line-clamp-2">{text}</span>
    </div>
  );
}

const COLORS = ['#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#f472b6', '#fb923c'];

export default function MissionControl() {
  const { data: ov } = useApi<Overview>('/autoapply/overview', { refreshInterval: 10_000 });
  const { data: applying } = useApi<LeadRow[]>('/autoapply/leads?status=APPLYING', { refreshInterval: 10_000 });
  const { data: submitted, mutate: refreshSubmitted } = useApi<LeadRow[]>('/autoapply/leads?status=SUBMITTED&sort=recent', { refreshInterval: 30_000 });
  const { data: tasks } = useApi<Task[]>('/tasks?state=running,queued,retry_wait', { refreshInterval: 10_000 });
  const { data: tailored } = useApi<Task[]>('/tasks?type=resume_tailoring&state=completed', { refreshInterval: 10_000 });

  const s = ov?.byStatus ?? {};
  const total = (s.SUBMITTED ?? 0) + (s.INTERVIEW ?? 0) + (s.REJECTED ?? 0) + (s.WITHDRAWN ?? 0);
  const today = ov?.submittedToday ?? 0;
  const cap = ov?.dailyApplyCap || 1;
  const sources = (ov?.sources ?? []).filter((x) => x.enabled);
  const lastScan = sources.map((x) => x.lastRunAt).filter(Boolean).sort().pop();
  // A sweep sets lastRunAt when it starts and lastSuccessAt when it ends. ponytail: a failed sweep looks running until
  // its 10-minute lease runs out, since the API keeps no failure time; expose one if that ever misleads.
  const ms = (d?: string | null) => (d ? new Date(d).getTime() : 0);
  const sweeping = sources.filter((x) => ms(x.lastRunAt) > ms(x.lastSuccessAt) && Date.now() - ms(x.lastRunAt) < 10 * 60_000).length;
  const scanning = sweeping > 0;
  const count = (type: string, running: boolean) => (tasks ?? []).filter((t) => t.type === type && (t.state === 'running') === running).length;
  const tailoring = count('resume_tailoring', true), tailorQueued = count('resume_tailoring', false);
  const scoring = count('job_match', true), scoreQueued = count('job_match', false);
  const now = applying?.[0];
  const review = s.READY_FOR_REVIEW ?? 0;
  const needs = ov?.needsAttention ?? [];
  const level = Math.floor(total / 25) + 1;

  // Handoffs: each real event between polls sends the sender to the receiver's desk with the document.
  const [trips, setTrips] = useState<Trip[]>([]);
  const seq = useRef(0);
  // Each robot walks its deliveries one after another; a repeat of the delivery already waiting last rides along as "+N more".
  const send = useCallback((way: RouteKey, label: string) => setTrips((all) => {
    const [from, to] = way.split('>') as [Crew, Dest];
    const last = all.findLast((t) => t.from === from);
    if (last?.way === way && all.find((t) => t.from === from) !== last) return all.map((t) => (t === last ? { ...t, extra: t.extra + 1 } : t));
    return [...all, { key: ++seq.current, way, from, to, label, extra: 0 }];
  }), []);
  const walking = trips.filter((t, i) => trips.findIndex((x) => x.from === t.from) === i); // the head of each robot's queue
  const started = useRef(new Set<number>());
  useEffect(() => {
    for (const t of walking) {
      if (started.current.has(t.key)) continue;
      started.current.add(t.key);
      setTimeout(() => setTrips((xs) => xs.filter((x) => x.key !== t.key)), tripS(ROUTES[t.way]) * 1000 + 300);
    }
  }, [walking.map((t) => t.key).join()]); // the heads are read fresh whenever they change
  const titled = (list: Task[] | undefined, fresh: string[], strip: RegExp, many: string) =>
    fresh.length > 1 ? `${fresh.length} ${many}` : (list ?? []).find((t) => t.id === fresh[0])?.title.replace(strip, '') ?? many;
  useNewIds(tasks?.filter((t) => t.type === 'job_match').map((t) => t.id), (f) => send('scout>sift', titled(tasks, f, /^Fit review: /, 'new jobs')));
  useNewIds(tasks?.filter((t) => t.type === 'resume_tailoring').map((t) => t.id), (f) => send('sift>stitch', titled(tasks, f, /^Tailor resume for /, 'jobs to tailor')));
  useNewIds(tailored?.map((t) => t.id), (f) => send('stitch>pilot', `CV for ${titled(tailored, f, /^Tailor resume for /, 'tailored CVs')}`));
  useNewIds(ov?.needsAttention.map((l) => l.id), (f) => send('pilot>you', f.length > 1 ? `${f.length} blocked jobs` : `${ov?.needsAttention.find((l) => l.id === f[0])?.company ?? 'a job'} (needs you)`));

  // A rise in today's count between polls means the runner just submitted something: celebrate.
  const [party, setParty] = useState<{ n: number; key: number } | null>(null);
  const prevToday = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ov) return;
    const prev = prevToday.current;
    prevToday.current = ov.submittedToday;
    if (prev !== undefined && ov.submittedToday > prev) {
      const n = ov.submittedToday - prev;
      setParty({ n, key: Date.now() });
      send('pilot>post', n > 1 ? `${n} receipts` : 'the receipt');
      void refreshSubmitted();
    }
  }, [ov, refreshSubmitted, send]);
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), 4500);
    return () => clearTimeout(t);
  }, [party]);

  // SMIL ignores the CSS reduced-motion rule, so the walking routes are switched off here.
  const [still, setStill] = useState(false);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, []);
  const moving = !still;

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const lit: Record<RoomKey, boolean> = { scout: scanning, sift: scoring > 0, stitch: tailoring > 0, you: needs.length > 0, post: !!party, pilot: !!now };
  const tripOf = (who: Crew) => walking.find((t) => t.from === who);
  const route = (who: Crew) => { const t = tripOf(who); return t && { key: t.key, route: ROUTES[t.way] }; };
  const carrying = (who: Crew, otherwise: string) => {
    const t = tripOf(who);
    const queued = trips.filter((x) => x.from === who).length - 1;
    return t ? `Taking ${t.label}${t.extra ? ` (+${t.extra} more)` : ''} to ${DEST[t.to]}…${queued ? ` ${queued} more after this.` : ''}` : otherwise;
  };
  const status = {
    scout: carrying('scout', scanning ? `Sweeping ${plural(sweeping, 'source')} now…` : lastScan ? `Off duty. Last sweep ${relTime(lastScan)}.` : `${plural(sources.length, 'source')}, no sweep yet.`),
    tally: scanning ? 'Checking new finds against your leads…' : 'Off duty. Repeats are merged on arrival.',
    sift: carrying('sift', scoring ? `Scoring ${plural(scoring, 'job')} for fit…${scoreQueued ? ` ${scoreQueued} queued.` : ''}` : scoreQueued ? `${scoreQueued} queued, waiting to start.` : `Off duty. ${(s.EVALUATED ?? 0) + (s.SHORTLISTED ?? 0)} jobs ranked.`),
    stitch: carrying('stitch', tailoring ? `Tailoring ${plural(tailoring, 'CV')} for ATS 85+…${tailorQueued ? ` ${tailorQueued} queued.` : ''}` : tailorQueued ? `${plural(tailorQueued, 'CV')} queued, waiting to start.` : 'Off duty. No CV in progress.'),
    pilot: carrying('pilot', now ? `Applying: ${now.title} @ ${now.company}` : (s.APPROVED ?? 0) ? `${s.APPROVED} approved, waiting for the runner.` : 'Off duty. Nothing approved to send.'),
    post: party ? `New submission logged! ${today} today.` : submitted?.[0] ? `Last sent: ${submitted[0].company}. ${today} today.` : `${today} sent today.`,
    you: needs.length ? `${plural(needs.length, 'job')} need${needs.length === 1 ? 's' : ''} you: ${needs[0].company}${needs.length > 1 ? ' and more' : ''}` : 'Nothing waiting on you.',
  };
  const bubbles: Record<RoomKey, ReactNode> = {
    scout: <><Bubble who="SCOUT" text={status.scout} /><Bubble who="TALLY" text={status.tally} tail="40%" /></>,
    sift: <Bubble who="SIFT" text={status.sift} tail="60%" />,
    stitch: <Bubble who="STITCH" text={status.stitch} tail="30%" />,
    you: <Bubble who="INBOX" text={status.you} up tail="45%" />,
    post: <Bubble who="POST" text={status.post} up tail="40%" />,
    pilot: <Bubble who="PILOT" text={status.pilot} up tail="60%" />,
  };
  const p = !!party;

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      <style>{CSS}</style>
      <div className="of relative min-h-[calc(100vh-1px)] overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="of-mono text-xs text-sky-300/70">CAREER OS · AUTO APPLY · MISSION CONTROL</p>
            <h1 className="of-mono of-glow text-2xl font-bold text-sky-100 sm:text-3xl">THE HIRING OFFICE</h1>
            <p className="of-mono text-xs text-sky-300/70">YOUR AGENTS ARE ON SHIFT · {ov?.autoSubmit ? 'AUTO-SUBMIT ON' : 'YOU APPROVE EACH'} · ≤ {cap}/DAY</p>
          </div>
          <Link href="/auto-apply" className="of-mono rounded-lg border border-sky-400/30 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-400/10">← BACK TO DISCOVER</Link>
        </div>

        {/* headline numbers + level */}
        <div className="of-panel mb-6 grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-3">
          <div className="p-4 sm:p-5">
            <p className="of-mono text-xs text-sky-300/80">TOTAL APPLICATIONS</p>
            <p className="of-glow text-5xl font-black tabular-nums text-white sm:text-6xl">{total}</p>
          </div>
          <div className="border-l border-sky-400/20 p-4 sm:p-5">
            <p className="of-mono text-xs text-sky-300/80">TODAY</p>
            <p className="text-3xl font-black tabular-nums text-white sm:text-4xl">{today} <span className="of-mono text-xs font-medium text-sky-300/80 sm:text-sm">/ {cap} TARGET</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-950" role="progressbar" aria-valuenow={today} aria-valuemax={cap} aria-label="Today's applications against the daily target">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all" style={{ width: `${Math.min(100, (today / cap) * 100)}%` }} />
            </div>
          </div>
          <div className="col-span-2 border-t border-sky-400/20 p-4 sm:col-span-1 sm:border-l sm:border-t-0 sm:p-5">
            <p className="of-mono text-xs text-sky-300/80">HUNTER LEVEL</p>
            <p className="text-3xl font-black tabular-nums text-amber-200 sm:text-4xl">LV {level}</p>
            <p className="of-mono mt-1 text-[11px] text-sky-300/70">{25 - (total % 25)} applications to LV {level + 1}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-950"><div className="h-full rounded-full bg-amber-300" style={{ width: `${((total % 25) / 25) * 100}%` }} /></div>
          </div>
        </div>

        {/* the office, seen from above */}
        <section className="relative mx-auto max-w-[1100px]" aria-label="Agents at work">
          <div className="relative overflow-hidden rounded-xl border-4 border-[#1b1e30] shadow-[0_20px_60px_rgba(2,8,23,.7)]">
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden>
              <defs>
                <filter id="px-outline" x="-20%" y="-20%" width="140%" height="140%">
                  <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grow" />
                  <feFlood floodColor="#0b1020" /><feComposite in2="grow" operator="in" result="line" />
                  <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <pattern id="px-wood" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#9a6b43" /><rect y="7" width="16" height="1" fill="#7c5434" /><rect y="15" width="16" height="1" fill="#7c5434" /><rect width="1" height="8" fill="#7c5434" /><rect x="8" y="8" width="1" height="8" fill="#7c5434" /><rect x="3" y="3" width="3" height="1" fill="#a87a50" /></pattern>
                <pattern id="px-lab" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#cfd6e0" /><rect width="8" height="8" fill="#bcc5d2" /><rect x="8" y="8" width="8" height="8" fill="#bcc5d2" /></pattern>
                <pattern id="px-carpet" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#34507a" /><rect width="1" height="1" fill="#3e5f8f" /><rect x="2" y="2" width="1" height="1" fill="#2e4870" /></pattern>
                <pattern id="px-green" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#2f5d50" /><rect width="1" height="1" fill="#386d5e" /><rect x="2" y="2" width="1" height="1" fill="#2a5347" /></pattern>
                <pattern id="px-concrete" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#878b94" /><rect width="16" height="1" fill="#797d86" /><rect width="1" height="16" fill="#797d86" /><rect x="6" y="9" width="1" height="1" fill="#959aa3" /></pattern>
                <pattern id="px-hall" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#5b6170" /><rect width="16" height="1" fill="#515766" /><rect width="1" height="16" fill="#515766" /></pattern>
              </defs>

              {/* floors */}
              {ROOMS.map((r) => <rect key={r.key} x={r.x} y={r.y} width="128" height="112" fill={`url(#${r.floor})`} />)}
              <rect y="112" width={W} height="32" fill="url(#px-hall)" />
              <rect x="20" y="126" width={W - 40} height="4" fill="#4b5161" />

              {/* SCOUTING DESK: twin monitors, a radar table, files */}
              <rect x="16" y="40" width="56" height="18" fill="#6b4a2e" /><rect x="16" y="40" width="56" height="2" fill="#8a6440" />
              <rect x="22" y="42" width="18" height="5" fill="#111827" /><rect x="23" y="43" width="16" height="2" fill="#38bdf8" className={lit.scout ? 'px-blink' : ''} />
              <rect x="46" y="42" width="18" height="5" fill="#111827" /><rect x="47" y="43" width="16" height="2" fill="#38bdf8" />
              <rect x="34" y="51" width="18" height="4" fill="#cbd5e1" />
              <rect x="38" y="62" width="12" height="9" fill="#374151" />
              <circle cx="98" cy="74" r="14" fill="#1e293b" /><circle cx="98" cy="74" r="11" fill="#052e2b" /><circle cx="98" cy="74" r="6" fill="none" stroke="#22c55e" strokeWidth=".8" />
              <path d="M98 74 L98 63 L104 65 Z" fill="#4ade80" opacity=".8">{lit.scout && moving && <animateTransform attributeName="transform" type="rotate" from="0 98 74" to="360 98 74" dur="2.4s" repeatCount="indefinite" />}</path>
              <rect x="102" y="70" width="2" height="2" fill="#bbf7d0" className={lit.scout ? 'px-blink' : ''} /><rect x="92" y="78" width="2" height="2" fill="#bbf7d0" className={lit.scout ? 'px-blink' : ''} />
              <rect x="6" y="78" width="12" height="28" fill="#475569" /><rect x="8" y="82" width="8" height="1" fill="#1e293b" /><rect x="8" y="92" width="8" height="1" fill="#1e293b" />
              <circle cx="114" cy="98" r="7" fill="#2f7d45" /><circle cx="112" cy="96" r="3" fill="#46a35e" />

              {/* SCORING LAB: bench with flasks, a fit meter, an island of scorecards */}
              <rect x="140" y="36" width="104" height="14" fill="#94a3b8" /><rect x="140" y="36" width="104" height="2" fill="#e2e8f0" />
              <circle cx="152" cy="43" r="4" fill="#a78bfa" /><circle cx="164" cy="43" r="3" fill="#4ade80" /><circle cx="232" cy="43" r="4" fill="#a78bfa" />
              <rect x="182" y="38" width="30" height="10" fill="#0f172a" /><rect x="184" y="42" width="26" height="3" fill="#1e293b" /><rect x="184" y="42" width="20" height="3" fill="#4ade80" className={lit.sift ? 'px-blink' : ''} />
              <rect x="160" y="74" width="64" height="12" fill="#64748b" /><rect x="160" y="74" width="64" height="2" fill="#cbd5e1" />
              {[166, 180, 194, 208].map((x) => <rect key={x} x={x} y="77" width="8" height="7" fill="#f8fafc" />)}
              <circle cx="240" cy="100" r="7" fill="#2f7d45" /><circle cx="238" cy="98" r="3" fill="#46a35e" />

              {/* CV STUDIO: cutting table with CVs, a printer that prints while tailoring */}
              <rect x="268" y="40" width="56" height="24" fill="#c49a6c" /><rect x="268" y="40" width="56" height="2" fill="#dcb58a" />
              <rect x="274" y="44" width="12" height="15" fill="#f8fafc" /><rect x="290" y="44" width="12" height="15" fill="#f8fafc" /><rect x="306" y="46" width="12" height="15" fill="#fef3c7" />
              <rect x="276" y="47" width="8" height="1" fill="#94a3b8" /><rect x="292" y="47" width="8" height="1" fill="#94a3b8" />
              <rect x="342" y="36" width="30" height="20" fill="#9ca3af" /><rect x="346" y="40" width="22" height="3" fill="#1f2937" />
              <rect x="348" y="42" width="18" height="12" fill="#f8fafc">{lit.stitch && moving && <animate attributeName="y" values="42;52;42" dur="2s" repeatCount="indefinite" />}</rect>
              <rect x="366" y="50" width="3" height="3" fill={lit.stitch ? '#4ade80' : '#475569'} className={lit.stitch ? 'px-blink' : ''} />
              <circle cx="268" cy="100" r="7" fill="#2f7d45" /><circle cx="266" cy="98" r="3" fill="#46a35e" />

              {/* hallway: coffee machine and water cooler */}
              <rect x="6" y="116" width="12" height="12" fill="#374151" /><rect x="8" y="118" width="8" height="3" fill="#7f1d1d" /><rect x="10" y="123" width="4" height="3" fill="#f8fafc" />
              <rect x="368" y="116" width="10" height="12" fill="#e2e8f0" /><rect x="370" y="117" width="6" height="5" fill="#7dd3fc" />

              {/* YOUR OFFICE: your desk and empty chair, in-tray filling up with what needs you, alarm light */}
              <rect x="22" y="160" width="76" height="46" fill="#7a3b3b" /><rect x="24" y="162" width="72" height="42" fill="none" stroke="#9b4d4d" strokeWidth="1" />
              <rect x="30" y="168" width="60" height="18" fill="#6b4a2e" /><rect x="30" y="168" width="60" height="2" fill="#8a6440" />
              <rect x="44" y="171" width="20" height="10" fill="#cbd5e1" /><rect x="46" y="172" width="16" height="7" fill="#1e293b" />
              <rect x="74" y="171" width="12" height="12" fill="#78716c" />
              {Array.from({ length: Math.min(5, needs.length) }, (_, i) => <rect key={i} x="75" y={181 - i * 2} width="10" height="2" fill={i % 2 ? '#fde68a' : '#f8fafc'} />)}
              <rect x="54" y="190" width="12" height="10" fill="#374151" /><rect x="54" y="198" width="12" height="2" fill="#1f2937" />
              <rect x="10" y="150" width="6" height="6" fill={needs.length ? '#ef4444' : '#475569'} className={needs.length ? 'px-blink' : ''} />
              <circle cx="114" cy="158" r="7" fill="#2f7d45" /><circle cx="112" cy="156" r="3" fill="#46a35e" />

              {/* MAILROOM: mailbox, sorting table, pigeonholes that fill with today's confirmations */}
              <rect x="136" y="150" width="12" height="14" fill="#2563eb" /><rect x="138" y="153" width="8" height="2" fill="#0f172a" /><rect x="148" y="150" width="2" height="5" fill={today ? '#ef4444' : '#475569'} />
              <rect x="150" y="178" width="60" height="18" fill="#6b4a2e" /><rect x="150" y="178" width="60" height="2" fill="#8a6440" />
              {[156, 170, 184, 198].map((x) => <rect key={x} x={x} y="183" width="9" height="6" fill="#f8fafc" />)}
              <rect x="232" y="150" width="20" height="72" fill="#3f2d1e" />
              {Array.from({ length: 12 }, (_, i) => {
                const x = 234 + (i % 2) * 9, y = 152 + Math.floor(i / 2) * 11;
                return <g key={i}><rect x={x} y={y} width="7" height="9" fill="#1c130c" />{i < Math.min(12, today) && <rect x={x + 1} y={y + 3} width="5" height="4" fill="#f8fafc" />}</g>;
              })}
              <circle cx="142" cy="212" r="6" fill="#a16207" /><circle cx="154" cy="216" r="5" fill="#854d0e" />

              {/* DISPATCH DESK: a server rack and the applying desk (cursor blinks while a form is being filled) */}
              <rect x="262" y="150" width="12" height="70" fill="#1f2937" />
              {[156, 166, 176, 186, 196, 206].map((y, i) => <rect key={y} x="265" y={y} width="2" height="2" fill={i % 2 ? '#38bdf8' : '#4ade80'} className={lit.pilot ? 'px-blink' : ''} style={{ animationDelay: `${i * 0.15}s` }} />)}
              <rect x="300" y="172" width="70" height="18" fill="#6b4a2e" /><rect x="300" y="172" width="70" height="2" fill="#8a6440" />
              <rect x="318" y="174" width="32" height="10" fill="#111827" /><rect x="320" y="179" width="28" height="2" fill="#1e293b" />
              <rect x="320" y="179" width="4" height="2" fill="#34d399" className={lit.pilot ? 'px-blink' : ''} />
              <rect x="354" y="176" width="10" height="7" fill="#cbd5e1" />

              {/* walls */}
              <g fill="#2b2f45">
                <rect width={W} height="4" /><rect y={H - 4} width={W} height="4" /><rect width="4" height={H} /><rect x={W - 4} width="4" height={H} />
                <rect x="126" width="4" height="112" /><rect x="254" width="4" height="112" /><rect x="126" y="144" width="4" height="112" /><rect x="254" y="144" width="4" height="112" />
                {hwall(110)}{hwall(142)}
              </g>
              <g fill="#4b5072"><rect y="4" width={W} height="1" /><rect y="114" width={W} height="1" /><rect y="146" width={W} height="1" /></g>

              {/* lights off where nobody is working */}
              {ROOMS.map((r) => !lit[r.key] && <rect key={r.key} x={r.x} y={r.y} width="128" height="112" fill="#050a19" opacity=".42" />)}

              {/* the crew */}
              <Agent seat={[44, 72]} trip={route('scout')} busy={scanning} color="#38bdf8" dark="#0369a1" party={p} still={still} />
              <Agent seat={[80, 104]} busy={scanning} color="#f472b6" dark="#be185d" party={p} still={still} front />
              <Agent seat={[196, 66]} trip={route('sift')} busy={scoring > 0} color="#a78bfa" dark="#6d28d9" party={p} still={still} doc="#ede9fe" />
              <Agent seat={[296, 78]} trip={route('stitch')} busy={tailoring > 0} color="#fbbf24" dark="#b45309" party={p} still={still} doc="#fef3c7" />
              <Agent seat={[335, 206]} trip={route('pilot')} busy={!!now} color="#34d399" dark="#047857" party={p} still={still} doc={tripOf('pilot')?.to === 'you' ? '#fde68a' : '#bbf7d0'} />
              <Agent seat={[180, 212]} busy={false} color="#fb923c" dark="#c2410c" party={p} still={still} />
            </svg>

            {/* rooms are links; name tag + speech bubble on top of the map */}
            {ROOMS.map((r) => {
              const top = r.y === 0;
              return (
                <Link key={r.key} href={r.href} className={`group absolute flex flex-col gap-1.5 p-1.5 outline-none ring-inset ring-sky-300/70 hover:ring-2 focus-visible:ring-2 sm:p-2 ${top ? '' : 'justify-end'}`}
                  style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(128 / W) * 100}%`, height: `${(112 / H) * 100}%` }}>
                  {top && <RoomTag name={r.name} lit={lit[r.key]} />}
                  <div className={`flex gap-1 ${r.key === 'scout' ? '*:min-w-0 *:flex-1' : 'flex-col'}`}>{bubbles[r.key]}</div>
                  {!top && <RoomTag name={r.name} lit={lit[r.key]} />}
                </Link>
              );
            })}
          </div>

          {/* phones: the same live status lines as a list */}
          <ul className="of-panel mt-3 space-y-1.5 rounded-xl p-3 text-[11px] sm:hidden">
            {([['SCOUT', status.scout, scanning], ['TALLY', status.tally, scanning], ['SIFT', status.sift, scoring > 0], ['STITCH', status.stitch, tailoring > 0], ['PILOT', status.pilot, !!now], ['POST', status.post, !!party], ['INBOX', status.you, needs.length > 0]] as const).map(([who, text, on]) => (
              <li key={who} className="flex gap-2"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'of-live bg-emerald-400' : 'bg-slate-500'}`} /><b className="of-mono w-14 shrink-0 text-sky-100">{who}</b><span className="min-w-0 text-sky-200/80">{text}</span></li>
            ))}
          </ul>

          {party && (
            <div key={party.key} className="pointer-events-none absolute inset-0 z-10" role="status">
              {Array.from({ length: 40 }, (_, i) => {
                const a = (i / 40) * Math.PI * 2, r = 110 + ((i * 37) % 150);
                return <span key={i} className="of-confetti" style={{ background: COLORS[i % COLORS.length], ['--x' as string]: `${Math.round(Math.cos(a) * r)}px`, ['--y' as string]: `${Math.round(Math.sin(a) * r * 0.6 - 60)}px`, ['--r' as string]: `${i * 47}deg`, animationDelay: `${(i % 5) * 40}ms` } as CSSProperties} />;
              })}
              <div className="of-toast absolute left-1/2 top-[38%] -translate-x-1/2 rounded-lg border-4 border-[#0b1020] bg-emerald-500 px-5 py-3 text-center shadow-[0_0_60px_rgba(52,211,153,.6)]">
                <p className="of-mono whitespace-nowrap text-2xl font-black text-white sm:text-3xl">+{party.n} APPLIED 🎉</p>
                {submitted?.[0] && <p className="of-mono text-xs text-emerald-50">{submitted[0].company} · {submitted[0].title}</p>}
              </div>
            </div>
          )}
        </section>

        {/* whiteboard, sent log, needs a human */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <section className="of-panel rounded-2xl p-4">
            <h2 className="of-mono mb-3 text-sm font-bold text-sky-100">WHITEBOARD · PIPELINE</h2>
            <dl className="of-mono grid grid-cols-2 gap-y-1.5 text-[11px]">
              {[['Found', (s.DISCOVERED ?? 0) + (s.EVALUATED ?? 0) + (s.SHORTLISTED ?? 0)], ['Ready for review', review], ['Approved', s.APPROVED ?? 0], ['Applying', s.APPLYING ?? 0], ['Submitted', s.SUBMITTED ?? 0], ['Interviews', s.INTERVIEW ?? 0], ['Needs attention', s.NEEDS_ATTENTION ?? 0], ['Skipped', s.SKIPPED ?? 0]].map(([k, v]) => (
                <div key={k as string} className="contents"><dt className="text-sky-300/80">{k}</dt><dd className="text-right tabular-nums text-sky-50">{v}</dd></div>
              ))}
            </dl>
          </section>
          <section className="of-panel rounded-2xl p-4">
            <h2 className="of-mono mb-3 text-sm font-bold text-sky-100">MAILROOM LOG · SENT</h2>
            <ul className="space-y-2 text-xs">
              {(submitted ?? []).slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <Link href={`/auto-apply/leads/${l.id}`} className="min-w-0 hover:underline"><span className="block truncate text-sky-100">{l.company}</span><span className="block truncate text-sky-300/70">{l.title}</span></Link></li>
              ))}
              {!submitted?.length && <li className="text-sky-300/60">No submissions yet.</li>}
            </ul>
          </section>
          <section className="of-panel rounded-2xl p-4">
            <h2 className="of-mono mb-3 text-sm font-bold text-amber-200">NEEDS A HUMAN</h2>
            <ul className="space-y-2 text-xs">
              {needs.slice(0, 6).map((l) => (
                <li key={l.id}><Link href={`/auto-apply/leads/${l.id}`} className="block hover:underline"><span className="block truncate text-sky-100">{l.company} · {l.title}</span><span className="block truncate text-amber-200/70">{l.statusReason}</span></Link></li>
              ))}
              {!needs.length && <li className="text-sky-300/60">Nothing waiting on you.</li>}
            </ul>
          </section>
        </div>

        {/* ticker */}
        <div className="of-panel mt-6 flex items-center gap-3 overflow-hidden rounded-xl px-4 py-2">
          <Link href="/auto-apply/queue" className="of-mono shrink-0 text-xs font-bold text-amber-200 hover:underline">{review} READY FOR REVIEW</Link>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="of-ticker flex w-max gap-8 whitespace-nowrap text-xs text-sky-200/90">
              {[0, 1].map((k) => (submitted ?? []).slice(0, 12).map((l) => <span key={`${k}-${l.id}`}>✓ {l.company} — {l.title}</span>))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomTag({ name, lit }: { name: string; lit: boolean }) {
  return (
    <span className="of-mono flex w-fit items-center gap-1 rounded-sm border-2 border-[#0b1020] bg-[#1b1e30]/90 px-1 py-px text-[7px] font-bold text-sky-50 group-hover:bg-sky-900 sm:text-[9px]">
      <span className={`h-1.5 w-1.5 ${lit ? 'bg-emerald-400' : 'bg-slate-500'}`} />{name}
    </span>
  );
}
