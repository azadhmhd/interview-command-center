'use client';
import {
  ArrowDown, ArrowUp, Award, Brain, Briefcase, Check, ChevronDown, Copy, Download, Eye, EyeOff, FileText, FolderOpen, Globe, GraduationCap, LayoutGrid,
  Link2, Mail, MapPin, MoreVertical, Palette, Pencil, Phone, Plus, Puzzle, Send, Sparkles, Trash2, User, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DoneBar, FCard, FField, FInput, FONT, FTextarea, GhostButton, GRADIENT, GRADIENT_TEXT, GradientButton, IconButton, Sheet, Toggle } from '@/components/resume/editor-ui';
import { ResumePages } from '@/components/resume/resume-pages';
import { ErrorBox, Loading, useAction, useToast } from '@/components/ui';
import { api, ApiError, getWorkspace, refresh, useApi } from '@/lib/api';
import {
  emptyEntry, KIND_LABEL, newSection, PAGE, SECTION_KINDS, TEMPLATES,
  type Draft, type DraftSummary, type ResumeContent, type ResumeDesign, type ResumeEntry, type ResumeSection, type SectionKind, type TemplateKey,
} from '@/lib/resume';
import { cn } from '@/lib/utils';

type Doc = { title: string; content: ResumeContent; design: ResumeDesign };
type Status = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
type Edit = null | { kind: 'personal' } | { kind: 'section'; s: number } | { kind: 'entry'; s: number; e: number };

const ICON: Record<SectionKind, LucideIcon> = {
  summary: User, skills: Brain, experience: Briefcase, education: GraduationCap, projects: FolderOpen, certificates: Award, languages: Globe, custom: Puzzle,
};
const BLURB: Record<SectionKind, string> = {
  summary: 'A short summary of your key strengths, experience and career goals.',
  experience: 'Your professional roles and employer history, including internships.',
  education: 'Your degrees and schools, with focus, honors or exchange terms.',
  skills: 'Hard and soft skills, grouped by area, that make you stand out.',
  projects: 'Key projects you took part in: your role, challenges and impact.',
  certificates: 'Industry certificates and licences, with issuer and date earned.',
  languages: 'Languages you speak and your proficiency level.',
  custom: 'A custom section for anything else, or to combine sections.',
};
const ENTRY_FIELDS: Record<SectionKind, [string, string, string, string]> = {
  experience: ['Job Title', 'Employer', 'Enter Job Title', 'Enter employer'],
  education: ['Degree', 'School', 'Enter Degree / Field Of Study', 'Enter school / university'],
  projects: ['Project', 'Role / Company', 'Enter project name', 'Enter role or company'],
  certificates: ['Certificate', 'Issuer', 'Enter certificate', 'Enter issuer'],
  languages: ['Language', 'Level', 'Enter language', 'e.g. Fluent'],
  custom: ['Title', 'Subtitle', 'Enter title', 'Enter subtitle'],
  summary: ['Title', 'Subtitle', '', ''], skills: ['Title', 'Subtitle', '', ''],
};
const ACCENTS = ['#000000', '#1f2937', '#1d4ed8', '#0e7490', '#047857', '#b91c1c', '#7c3aed', '#be185d'];

const move = <T,>(xs: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const c = [...xs];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};
const range = (e: ResumeEntry) => [e.start, e.end].filter(Boolean).join(' – ');
const rid = () => Math.random().toString(36).slice(2, 10);

/** Text area that edits a string[] (one item per line, or comma separated) without fighting the cursor. */
function ListInput({ value, onChange, sep, ...p }: { value: string[]; onChange: (v: string[]) => void; sep: 'line' | 'comma' } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const joiner = sep === 'line' ? '\n' : ', ';
  const [raw, setRaw] = useState(value.join(joiner));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setRaw(value.join(joiner)); last.current = value; } }, [value, joiner]);
  return <FTextarea {...p} value={raw} onChange={(e) => {
    setRaw(e.target.value);
    const next = sep === 'line' ? e.target.value.split('\n') : e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
    last.current = next;
    onChange(next);
  }} />;
}

// ── Content: list view ──────────────────────────────────────────────────────────────────────────────────────────────

function PersonalCard({ c, onEdit }: { c: ResumeContent; onEdit: () => void }) {
  const h = c.header;
  const rows: [LucideIcon, string][] = [[Mail, h.email || 'Email'], [Phone, h.phone || 'Phone'], [MapPin, h.location || 'Address'], ...h.links.map((l): [LucideIcon, string] => [Link2, l.label || l.url])];
  return (
    <FCard className="relative cursor-pointer px-7 pb-9 pt-6" onClick={onEdit}>
      <button type="button" aria-label="Edit personal details" onClick={(e) => { e.stopPropagation(); onEdit(); }} className={cn(GRADIENT, 'absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-accent-fg')}><Pencil className="h-3.5 w-3.5" /></button>
      <p className={cn('mt-[9px] text-[20px] font-bold leading-7', h.fullName ? 'text-text' : 'text-muted')}>{h.fullName || 'Your name'}</p>
      {h.headline && <p className="mt-0.5 text-[15px] text-text">{h.headline}</p>}
      <ul className="mt-[17px]">
        {rows.map(([Icon, text], i) => <li key={i} className="flex h-[39px] items-center gap-3 text-[15px] text-muted"><Icon className="h-[19px] w-[23px] shrink-0" strokeWidth={1.6} /><span className={cn('truncate', i < 3 && text !== ['Email', 'Phone', 'Address'][i] && 'text-text')}>{text}</span></li>)}
      </ul>
    </FCard>
  );
}

function SectionCard({ s, onOpenSection, onOpenEntry, onAddEntry, set, onMove }: {
  s: ResumeSection; onOpenSection: () => void; onOpenEntry: (e: number) => void; onAddEntry: () => void; set: (s: ResumeSection) => void; onMove: (d: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = ICON[s.kind];
  const textual = s.kind === 'summary';
  const entryKind = s.kind !== 'summary' && s.kind !== 'skills';
  return (
    <FCard className={cn('px-5 py-4', s.hidden && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-text" />
        <button type="button" className="min-w-0 flex-1 truncate text-left text-[18px] font-bold text-text" onClick={onOpenSection}>{s.title || KIND_LABEL[s.kind]}</button>
        <IconButton label="Move section up" onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
        <IconButton label="Move section down" onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconButton>
        <IconButton label={s.hidden ? 'Show section' : 'Hide section'} onClick={() => set({ ...s, hidden: !s.hidden })}>{s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</IconButton>
        <IconButton label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)}><ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} /></IconButton>
      </div>
      {open && (
        <div className="mt-3 space-y-1">
          {textual && (
            <button type="button" onClick={onOpenSection} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-surface-2">
              <p className={cn('line-clamp-3 text-[15px]', s.text ? 'text-text' : 'text-muted')}>{s.text || 'Write a short summary…'}</p>
            </button>
          )}
          {s.kind === 'skills' && (
            <button type="button" onClick={onOpenSection} className="block w-full space-y-1 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2">
              {s.groups.length ? s.groups.map((g, i) => <p key={g.id ?? i} className="truncate text-[15px] text-text"><b className="text-text">{g.label || 'Untitled group'}</b>{g.items.length ? ` — ${g.items.join(', ')}` : ''}</p>)
                : <p className="text-[15px] text-muted">Add your skills…</p>}
            </button>
          )}
          {entryKind && s.entries.map((e, i) => (
            <div key={e.id ?? i} className="group flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-surface-2">
              <button type="button" onClick={() => onOpenEntry(i)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[15px] font-semibold text-text">{e.title || <span className="font-normal text-muted">Untitled</span>}</p>
                {(e.subtitle || range(e) || e.location) && <p className="truncate text-[14px] text-muted">{[e.subtitle, range(e), e.location].filter(Boolean).join(' · ')}</p>}
              </button>
              <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Move entry up" onClick={() => set({ ...s, entries: move(s.entries, i, -1) })}><ArrowUp className="h-4 w-4" /></IconButton>
                <IconButton label="Move entry down" onClick={() => set({ ...s, entries: move(s.entries, i, 1) })}><ArrowDown className="h-4 w-4" /></IconButton>
                <IconButton label="Delete entry" onClick={() => { if (confirm(`Delete "${e.title || 'this entry'}"?`)) set({ ...s, entries: s.entries.filter((_, j) => j !== i) }); }}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            </div>
          ))}
          {entryKind && (
            <button type="button" onClick={onAddEntry} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[15px] font-medium text-text hover:bg-surface-2">
              <Plus className="h-4 w-4" />{s.title || KIND_LABEL[s.kind]}
            </button>
          )}
        </div>
      )}
    </FCard>
  );
}

// ── Content: edit views ─────────────────────────────────────────────────────────────────────────────────────────────

function EditPersonal({ c, set }: { c: ResumeContent; set: (c: ResumeContent) => void }) {
  const h = c.header;
  const f = (k: keyof typeof h) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...c, header: { ...h, [k]: e.target.value } });
  const links = (links: typeof h.links) => set({ ...c, header: { ...h, links } });
  return (
    <FCard className="px-7 pb-8 pt-6">
      <h2 className="mb-5 text-[22px] font-bold text-text">Edit Personal Details</h2>
      <div className="grid gap-4">
        <FField label="Full name"><FInput value={h.fullName} onChange={f('fullName')} placeholder="Enter your title, first- and last name" /></FField>
        <FField label="Professional title"><FInput value={h.headline} onChange={f('headline')} placeholder="Target position or current role" /></FField>
        <FField label="Email"><FInput value={h.email} onChange={f('email')} placeholder="Enter email" /></FField>
        <FField label="Phone"><FInput value={h.phone} onChange={f('phone')} placeholder="Enter Phone" /></FField>
        <FField label="Location"><FInput value={h.location} onChange={f('location')} placeholder="City, Country" /></FField>
      </div>
      <p className="mb-2 mt-6 text-[15px] font-semibold text-text">Links</p>
      <p className="mb-3 text-[13px] text-muted">Shown after your phone, in this order.</p>
      <div className="space-y-2">
        {h.links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <FInput aria-label="Link text" value={l.label} placeholder="Text, e.g. janedoe" onChange={(e) => links(h.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <FInput aria-label="Link URL" value={l.url} placeholder="https://linkedin.com/in/…" onChange={(e) => links(h.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <IconButton label="Remove link" className="h-11 w-11 shrink-0" onClick={() => links(h.links.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        ))}
      </div>
      <GhostButton className="mt-3 h-10" onClick={() => links([...h.links, { label: '', url: '' }])}><Plus className="h-4 w-4" />LinkedIn, website…</GhostButton>
    </FCard>
  );
}

function EditSection({ s, set, onDelete }: { s: ResumeSection; set: (s: ResumeSection) => void; onDelete: () => void }) {
  return (
    <FCard className="px-7 pb-8 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold text-text">Edit {KIND_LABEL[s.kind]}</h2>
        <IconButton label="Delete section" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
      <div className="grid gap-4">
        <FField label="Section heading" hint={s.kind === 'summary' ? 'Leave empty to show the summary without a heading.' : undefined}>
          <FInput value={s.title} onChange={(e) => set({ ...s, title: e.target.value })} placeholder={s.kind === 'summary' ? 'No heading' : KIND_LABEL[s.kind]} />
        </FField>
        {(s.kind === 'summary' || s.kind === 'custom') && <FField label={s.kind === 'summary' ? 'Summary' : 'Text'}><FTextarea className="min-h-48" value={s.text} onChange={(e) => set({ ...s, text: e.target.value })} placeholder="Describe your key strengths, experience and goals" /></FField>}
        {s.kind === 'skills' && (
          <div className="space-y-3">
            {s.groups.map((g, i) => (
              <div key={g.id ?? i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <FInput aria-label="Group label" value={g.label} placeholder="Skill group, e.g. Backend & Languages" onChange={(e) => set({ ...s, groups: s.groups.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <IconButton label="Move group up" onClick={() => set({ ...s, groups: move(s.groups, i, -1) })}><ArrowUp className="h-4 w-4" /></IconButton>
                  <IconButton label="Move group down" onClick={() => set({ ...s, groups: move(s.groups, i, 1) })}><ArrowDown className="h-4 w-4" /></IconButton>
                  <IconButton label="Delete group" onClick={() => set({ ...s, groups: s.groups.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></IconButton>
                </div>
                <ListInput sep="comma" aria-label="Skills, comma separated" className="min-h-20" value={g.items} placeholder="Python, Django, FastAPI" onChange={(items) => set({ ...s, groups: s.groups.map((x, j) => (j === i ? { ...x, items } : x)) })} />
              </div>
            ))}
            <GhostButton className="h-10" onClick={() => set({ ...s, groups: [...s.groups, { id: rid(), label: '', items: [] }] })}><Plus className="h-4 w-4" />Skill group</GhostButton>
          </div>
        )}
      </div>
    </FCard>
  );
}

function EditEntry({ kind, e, set, onDelete }: { kind: SectionKind; e: ResumeEntry; set: (e: ResumeEntry) => void; onDelete: () => void }) {
  const inline = kind === 'certificates' || kind === 'languages';
  const [t, sub, tp, sp] = ENTRY_FIELDS[kind];
  const f = (k: keyof ResumeEntry) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ ...e, [k]: ev.target.value });
  return (
    <FCard className="px-7 pb-8 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold text-text">Edit Entry</h2>
        <IconButton label="Delete entry" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
      <div className="grid gap-4">
        <FField label={t}><FInput value={e.title} onChange={f('title')} placeholder={tp} /></FField>
        <FField label={sub}><FInput value={e.subtitle} onChange={f('subtitle')} placeholder={sp} /></FField>
        {inline ? (
          <FField label="Date"><FInput value={e.end} onChange={f('end')} placeholder="e.g. Jun 2026" /></FField>
        ) : (
          <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-3">
            <FField label="Start Date"><FInput value={e.start} onChange={f('start')} placeholder="2019" /></FField>
            <FField label="End Date"><FInput value={e.end} onChange={f('end')} placeholder="Present" /></FField>
            <FField label="Location"><FInput value={e.location} onChange={f('location')} placeholder="City, Country" /></FField>
          </div>
        )}
        {!inline && <FField label="Link"><FInput value={e.url} onChange={f('url')} placeholder="https://" /></FField>}
        <FField label="Description"><FTextarea value={e.description} onChange={f('description')} placeholder={inline ? 'One line under the title' : 'Short paragraph (optional)'} className="min-h-20" /></FField>
        {!inline && <FField label="Bullet points" hint="One achievement per line."><ListInput sep="line" value={e.bullets} onChange={(bullets) => set({ ...e, bullets })} className="min-h-56" placeholder="Describe your role & achievements" /></FField>}
      </div>
    </FCard>
  );
}

function AddContentSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (k: SectionKind) => void }) {
  const banner = (
    <div className="flex items-center gap-6 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
      <span><b className="block text-[15px] text-text">Already have a resume?</b><span className="text-[14px]">Import it to prefill your content.</span></span>
      <Link href="/resumes" className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-[14px] font-bold text-accent-fg">Import resume</Link>
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Add content" aside={banner} wide>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTION_KINDS.map((k) => {
          const Icon = ICON[k];
          return (
            <button key={k} type="button" onClick={() => onAdd(k)} className={cn('rounded-lg px-4 py-5 text-left transition-colors hover:bg-border', k === 'custom' ? 'border border-dashed border-border bg-surface' : 'bg-surface-2')}>
              <span className="flex items-center gap-2.5 text-[18px] font-bold leading-[21.6px] text-text"><Icon className="h-4 w-4" />{KIND_LABEL[k]}</span>
              <span className="mt-1 block text-[15px] leading-[22.5px] text-muted">{BLURB[k]}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// ── Customize ──────────────────────────────────────────────────────────────────────────────────────────────────────

const CUSTOMIZE_NAV = [['document', 'Document'], ['templates', 'Templates'], ['font', 'Font Size'], ['spacing', 'Spacing'], ['headings', 'Headings'], ['colors', 'Colors'], ['footer', 'Footer']] as const;

function Customize({ d, set }: { d: ResumeDesign; set: (d: ResumeDesign) => void }) {
  const [active, setActive] = useState<string>('document');
  const card = 'scroll-mt-8 px-9 pb-10 pt-9';
  const h = 'mb-[22px] text-[24px] font-extrabold leading-8 text-text';
  const select = 'h-12 w-80 max-w-full rounded-lg border-0 bg-surface-2 px-3 text-[15px] text-text';
  return (
    <div className="flex gap-2">
      <nav className="sticky top-0 hidden w-32 shrink-0 flex-col gap-1 self-start sm:flex" aria-label="Customize sections">
        {CUSTOMIZE_NAV.map(([id, label]) => (
          <a key={id} href={`#c-${id}`} onClick={() => setActive(id)} aria-current={active === id ? 'true' : undefined}
            className={cn('h-9 border-l-2 px-3 py-2 text-[14px] font-semibold leading-5', active === id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text')}>{label}</a>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        <FCard id="c-document" className={card}>
          <h2 className={h}>Document Settings</h2>
          <FField label="Page Format">
            <select value={d.pageFormat} onChange={(e) => set({ ...d, pageFormat: e.target.value as ResumeDesign['pageFormat'] })} className={select}>
              <option value="A4">A4</option><option value="Letter">US Letter</option>
            </select>
          </FField>
        </FCard>
        <FCard id="c-templates" className={card}>
          <h2 className={h}>Design Templates</h2>
          <div className="grid gap-3">
            {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
              <button key={k} type="button" onClick={() => set({ ...d, template: k })}
                className={cn('flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left', d.template === k ? 'border-accent bg-accent-soft' : 'border-border hover:border-border')}>
                <span><span className="block text-[16px] font-semibold text-text">{TEMPLATES[k].label}</span><span className="text-[13px] text-muted">{TEMPLATES[k].description}</span></span>
                {d.template === k && <span className={cn(GRADIENT, 'inline-flex h-6 w-6 items-center justify-center rounded-full text-accent-fg')}><Check className="h-3.5 w-3.5" /></span>}
              </button>
            ))}
          </div>
        </FCard>
        <FCard id="c-font" className={card}>
          <h2 className={h}>Font Size</h2>
          <FField label={`Text size · ${Math.round(d.fontScale * 100)}%`}><input type="range" min={0.8} max={1.2} step={0.01} value={d.fontScale} onChange={(e) => set({ ...d, fontScale: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /></FField>
        </FCard>
        <FCard id="c-spacing" className={card}>
          <h2 className={h}>Spacing</h2>
          <FField label={`Margins · ${d.marginMm} mm`}><input type="range" min={6} max={30} step={0.5} value={d.marginMm} onChange={(e) => set({ ...d, marginMm: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /></FField>
        </FCard>
        <FCard id="c-headings" className={card}>
          <h2 className={h}>Section Headings</h2>
          <Toggle checked={d.headingIcons} onChange={(headingIcons) => set({ ...d, headingIcons })} label="Icons before headings" />
          {d.icons && Object.keys(d.icons).length > 0 && <p className="mt-2 text-[13px] text-muted">Using the icons from your imported PDF ({Object.keys(d.icons).length}).</p>}
        </FCard>
        <FCard id="c-colors" className={card}>
          <h2 className={h}>Colors</h2>
          <p className="mb-3 text-[15px] font-semibold text-text">Accent color</p>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => set({ ...d, accent: c })} className={cn('h-9 w-9 rounded-full ring-offset-2 ring-offset-surface', d.accent.toLowerCase() === c && 'ring-2 ring-accent')} style={{ background: c }} />
            ))}
            <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-border" title="Custom color">
              <Palette className="absolute inset-0 m-auto h-4 w-4 text-muted" />
              <input type="color" value={d.accent} onChange={(e) => set({ ...d, accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </FCard>
        <FCard id="c-footer" className={card}>
          <h2 className={h}>Footer</h2>
          <Toggle checked={d.footer} onChange={(footer) => set({ ...d, footer })} label="Page numbers, email and name" />
        </FCard>
      </div>
    </div>
  );
}

/** Preview scaled to the column width; layout happens at real page size. */
function Preview({ doc, onPages }: { doc: Doc; onPages: (n: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  const [height, setHeight] = useState(0);
  const content = useDeferredValue(doc.content);
  const design = useDeferredValue(doc.design);
  const pageW = (PAGE[design.pageFormat] ?? PAGE.A4).w;
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / pageW)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW]);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} className="overflow-hidden" style={{ height: height * scale }}>
      <div ref={inner} style={{ width: pageW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <ResumePages content={content} design={design} onRendered={onPages} pageGap={24} />
      </div>
    </div>
  );
}

function CopyForJobSheet({ draft, open, onClose }: { draft: Draft; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<'application' | 'lead'>('application');
  const [target, setTarget] = useState('');
  const [ai, setAi] = useState(true);
  const { data: apps } = useApi<{ id: string; companyName: string; jobTitle: string }[]>(open ? '/applications' : null);
  const { data: leads } = useApi<{ id: string; company: string; title: string }[]>(open ? '/autoapply/leads?status=READY_FOR_REVIEW,APPROVED,SHORTLISTED,EVALUATED' : null);
  const { busy, run } = useAction();
  const items = kind === 'application' ? (apps ?? []).map((a) => ({ id: a.id, label: `${a.companyName} – ${a.jobTitle}` })) : (leads ?? []).map((l) => ({ id: l.id, label: `${l.company} – ${l.title}` }));
  const body = kind === 'application' ? { applicationId: target } : { jobLeadId: target };
  return (
    <Sheet open={open} onClose={onClose} title="Copy for a job">
      <div className="space-y-4 text-[15px]">
        <p className="text-muted">A new resume with the same design and content, linked to the job. &ldquo;{draft.title}&rdquo; stays unchanged.</p>
        <div className="inline-flex rounded-xl bg-surface-2 p-1">
          {(['application', 'lead'] as const).map((k) => <button key={k} type="button" onClick={() => { setKind(k); setTarget(''); }} className={cn('rounded-lg px-4 py-2 text-[14px] font-medium', kind === k ? 'bg-surface text-text shadow-sm' : 'text-muted')}>{k === 'application' ? 'Application' : 'Job lead'}</button>)}
        </div>
        <select aria-label="Job" value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 w-full rounded-lg border-0 bg-surface-2 px-3 text-[15px] text-text">
          <option value="">Choose a job…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <Toggle checked={ai} onChange={setAi} label="Tailor the wording to the job with AI" />
        <p className="-mt-2 pl-14 text-[13px] text-muted">Only rewords and reorders what is already in your resume: no new skills, employers, numbers or dates.</p>
        <GradientButton className="h-12 w-full text-[16px]" disabled={!target} loading={busy === 'go'} onClick={async () => {
          const r = await run('go', () => (ai ? api<{ draft: DraftSummary }>(`/resume-drafts/${draft.id}/tailor`, { body }) : api<DraftSummary>(`/resume-drafts/${draft.id}/duplicate`, { body }).then((d) => ({ draft: d }))),
            ai ? 'Copy created. AI tailoring is queued and updates this copy when done.' : 'Copy created');
          if (r) router.push(`/resumes/${r.draft.id}`);
        }}><Copy className="h-4 w-4" />Create copy</GradientButton>
      </div>
    </Sheet>
  );
}

async function downloadPdf(id: string, title: string) {
  const ws = getWorkspace();
  const res = await fetch(`/api/resume-drafts/${id}/pdf`, { headers: ws ? { 'x-workspace-id': ws } : {} });
  if (!res.ok) throw new ApiError((await res.json().catch(() => null))?.message ?? `PDF failed (${res.status})`, res.status, null);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/[^\w.\- ]/g, '_') || 'resume'}.pdf` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResumeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Draft>(`/resume-drafts/${id}`, { revalidateOnFocus: false });
  const { data: drafts } = useApi<DraftSummary[]>('/resume-drafts');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [tab, setTab] = useState<'content' | 'customize' | 'ai'>('content');
  const [edit, setEdit] = useState<Edit>(null);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<Status>('saved');
  const [pages, setPages] = useState(0);
  const base = useRef('');
  const version = useRef(0);
  const savedVersion = useRef(0);
  const latest = useRef<Doc | null>(null);
  /** saves run one after another: each needs the updatedAt the previous one returned */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { busy, run } = useAction();

  // load once; later server responses never overwrite what is being typed
  useEffect(() => {
    if (data && !doc) { const d = { title: data.title, content: data.content, design: data.design }; setDoc(d); latest.current = d; base.current = data.updatedAt; }
  }, [data, doc]);

  /** Queue a save of the newest edits; a no-op when they are already saved. */
  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const v = version.current, d = latest.current;
      if (!d || v === savedVersion.current) return;
      setStatus('saving');
      try {
        const r = await api<Draft>(`/resume-drafts/${id}`, { method: 'PUT', body: { ...d, baseUpdatedAt: base.current } });
        base.current = r.updatedAt;
        savedVersion.current = v;
        setStatus(version.current === v ? 'saved' : 'dirty');
      } catch (e) {
        setStatus(e instanceof ApiError && e.status === 409 ? 'conflict' : 'error');
        toast((e as Error).message, 'danger');
      }
    });
    return queue.current;
  }, [id, toast]);

  useEffect(() => {
    if (status !== 'dirty') return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [doc, status, save]);

  // editor and preview scroll separately; opening an edit view or another tab starts the editor at the top
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [edit, tab]);

  const update = (d: Doc) => { version.current++; latest.current = d; setDoc(d); setStatus('dirty'); };
  /** Save now (before PDF / publish / copy) so the server works on exactly what you see. */
  const flush = () => save();

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  if (!doc) return <Loading />;
  const c = doc.content;
  const setContent = (content: ResumeContent) => update({ ...doc, content });
  const setSection = (s: number, sec: ResumeSection) => setContent({ ...c, sections: c.sections.map((x, j) => (j === s ? sec : x)) });
  const job = data.application ? { href: `/applications/${data.application.id}`, label: `${data.application.companyName} – ${data.application.jobTitle}` }
    : data.jobLead ? { href: `/auto-apply/leads/${data.jobLead.id}`, label: `${data.jobLead.company} – ${data.jobLead.title}` } : null;
  const publish = () => run('pub', async () => {
    await flush();
    const r = await api<{ resume: { label: string; version: number } }>(`/resume-drafts/${id}/publish`, { body: {} });
    await mutate();
    refresh('/resumes');
    return r;
  }, job ? 'Published and attached to the job' : 'Published to Profile & CVs');
  const tabs = [['content', 'Content', FileText], ['customize', 'Customize', Palette], ['ai', 'AI Tools', Sparkles]] as const;
  const statusText = status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved' : status === 'error' ? 'Not saved' : status === 'conflict' ? 'Changed elsewhere' : 'Saved';

  let left: React.ReactNode;
  if (tab === 'customize') left = <Customize d={doc.design} set={(design) => update({ ...doc, design })} />;
  else if (tab === 'ai') {
    left = (
      <div className="space-y-4">
        <FCard className="px-7 pb-8 pt-6">
          <h2 className="mb-2 text-[22px] font-bold text-text">Copy &amp; tailor for a job</h2>
          <p className="mb-5 text-[15px] text-muted">Make a copy of this resume for an application or job lead. The AI may only reword and reorder what is already here; added numbers are rejected.</p>
          <GradientButton className="h-12 px-6 text-[16px]" onClick={async () => { await flush(); setCopying(true); }}><Sparkles className="h-4 w-4" />Tailor for a job</GradientButton>
        </FCard>
        <FCard className="px-7 pb-8 pt-6">
          <h2 className="mb-2 text-[22px] font-bold text-text">Import a CV</h2>
          <p className="mb-5 text-[15px] text-muted">Turn an uploaded PDF CV into a new resume, word for word, keeping its heading icons.</p>
          <GhostButton className="h-11" onClick={() => router.push('/resumes')}>Go to import</GhostButton>
        </FCard>
      </div>
    );
  } else if (edit?.kind === 'personal') {
    left = <><EditPersonal c={c} set={setContent} /><DoneBar onDone={() => setEdit(null)} /></>;
  } else if (edit?.kind === 'section' && c.sections[edit.s]) {
    const s = c.sections[edit.s];
    left = <><EditSection s={s} set={(x) => setSection(edit.s, x)} onDelete={() => { if (confirm(`Delete the ${s.title || KIND_LABEL[s.kind]} section?`)) { setContent({ ...c, sections: c.sections.filter((_, j) => j !== edit.s) }); setEdit(null); } }} /><DoneBar onDone={() => setEdit(null)} /></>;
  } else if (edit?.kind === 'entry' && c.sections[edit.s]?.entries[edit.e]) {
    const s = c.sections[edit.s];
    left = (
      <>
        <EditEntry kind={s.kind} e={s.entries[edit.e]} set={(x) => setSection(edit.s, { ...s, entries: s.entries.map((y, j) => (j === edit.e ? x : y)) })}
          onDelete={() => { if (confirm('Delete this entry?')) { setSection(edit.s, { ...s, entries: s.entries.filter((_, j) => j !== edit.e) }); setEdit(null); } }} />
        <DoneBar onDone={() => setEdit(null)} />
      </>
    );
  } else {
    left = (
      <div className="space-y-4">
        <PersonalCard c={c} onEdit={() => setEdit({ kind: 'personal' })} />
        {c.sections.map((s, i) => (
          <SectionCard key={s.id ?? i} s={s} set={(x) => setSection(i, x)}
            onMove={(d) => setContent({ ...c, sections: move(c.sections, i, d) })}
            onOpenSection={() => setEdit({ kind: 'section', s: i })}
            onOpenEntry={(e) => setEdit({ kind: 'entry', s: i, e })}
            onAddEntry={() => { setSection(i, { ...s, entries: [...s.entries, { ...emptyEntry(), id: rid() }] }); setEdit({ kind: 'entry', s: i, e: s.entries.length }); }} />
        ))}
        <div className="flex justify-center pt-8">
          <GradientButton className="h-[60px] w-[280px] text-[18px]" onClick={() => setAdding(true)}><Plus className="h-5 w-5" />Add Content</GradientButton>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-text" style={{ fontFamily: FONT }}>
      <header className="relative z-20 mx-6 flex h-[72px] shrink-0 items-center gap-4 rounded-b-2xl bg-surface px-4 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
        <Link href="/resumes" className="inline-flex h-[41px] w-[134px] shrink-0 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-medium text-text hover:bg-surface-2"><LayoutGrid className="h-4 w-4" />Overview</Link>
        <nav className="ml-6 flex flex-1 items-center gap-3" aria-label="Editor">
          {tabs.map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => { setTab(key); setEdit(null); }} aria-current={tab === key ? 'page' : undefined}
              className={cn('inline-flex h-12 items-center gap-2 rounded-xl px-[21px] text-[16px] font-medium', tab === key ? 'bg-surface-2' : 'text-text hover:bg-surface-2')}>
              <Icon className={cn('h-4 w-4', tab === key && 'text-accent')} /><span className={cn(tab === key && GRADIENT_TEXT)}>{label}</span>
            </button>
          ))}
        </nav>
        <div className="hidden min-w-0 items-center gap-2 text-[13px] text-muted xl:flex" aria-live="polite">
          {job && <Link href={job.href} title={job.label} className="inline-flex max-w-56 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 font-medium text-text"><Briefcase className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{job.label}</span></Link>}
          {data.publishedResume && <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 font-medium text-success">Published v{data.publishedResume.version}</span>}
          <span className="shrink-0">{statusText}{pages > 0 && ` · ${pages} page${pages > 1 ? 's' : ''}`}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <select aria-label="Switch resume" value={id} onChange={async (e) => { await flush(); router.push(`/resumes/${e.target.value}`); }}
          className="h-10 w-40 truncate rounded-lg border border-border bg-surface-2 pl-4 pr-8 text-[15px] font-semibold text-text">
          {(drafts ?? [{ id, title: doc.title } as DraftSummary]).map((x) => <option key={x.id} value={x.id}>{x.id === id ? doc.title : x.title}</option>)}
        </select>
        <button type="button" disabled={busy === 'pdf'} onClick={() => run('pdf', async () => { await flush(); await downloadPdf(id, doc.title); })}
          className="inline-flex h-10 w-[148px] shrink-0 items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60">
          Download<Download className="h-4 w-4" />
        </button>
        <div className="relative">
          <button type="button" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)} className="inline-flex h-10 w-8 items-center justify-center rounded-lg border border-border text-text hover:bg-surface-2"><MoreVertical className="h-4 w-4" /></button>
          {menu && (
            <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
              {([
                [Pencil, 'Rename', () => { const t = prompt('Resume name', doc.title)?.trim(); if (t) update({ ...doc, title: t.slice(0, 120) }); }],
                [Send, 'Publish as CV', () => publish()],
                [Sparkles, 'Copy for a job', async () => { await flush(); setCopying(true); }],
                [Copy, 'Duplicate', () => run('dup', async () => { await flush(); const x = await api<DraftSummary>(`/resume-drafts/${id}/duplicate`, { body: {} }); router.push(`/resumes/${x.id}`); }, 'Copy created')],
                [Trash2, 'Delete resume', () => { if (confirm(`Delete "${doc.title}"? Published PDFs stay in Profile & CVs.`)) run('del', async () => { await api(`/resume-drafts/${id}`, { method: 'DELETE' }); router.push('/resumes'); }); }],
              ] as const).map(([Icon, label, act]) => (
                <button key={label} type="button" onClick={() => { setMenu(false); act(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] text-text hover:bg-surface-2"><Icon className="h-4 w-4" />{label}</button>
              ))}
            </div>
          )}
        </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-5 px-6">
        {/* px-2 / -ml-2: room for the card shadows, which an overflow container would clip */}
        <div ref={scroller} className="-ml-2 w-full max-w-[602px] shrink-0 overflow-y-auto px-2 pb-16 pt-8">
          {status === 'conflict' && (
            <FCard className="mb-4 flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
              <span>This resume changed in another tab.</span>
              <GhostButton className="h-9" onClick={async () => { const d = await mutate(); if (d) { const x = { title: d.title, content: d.content, design: d.design }; setDoc(x); latest.current = x; base.current = d.updatedAt; savedVersion.current = version.current; setStatus('saved'); } }}>Load latest</GhostButton>
            </FCard>
          )}
          {left}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto pb-16 pt-8" aria-label="Preview">
          <Preview doc={doc} onPages={setPages} />
        </div>
      </main>

      <AddContentSheet open={adding} onClose={() => setAdding(false)} onAdd={(k) => { const s = newSection(k); setContent({ ...c, sections: [...c.sections, s] }); setAdding(false); setEdit(k === 'summary' || k === 'skills' || k === 'custom' ? { kind: 'section', s: c.sections.length } : null); }} />
      <CopyForJobSheet draft={data} open={copying} onClose={() => setCopying(false)} />
    </div>
  );
}
