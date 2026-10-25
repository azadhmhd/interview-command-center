'use client';
import '@fontsource/source-serif-pro/400.css';
import '@fontsource/source-serif-pro/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/700.css';
import { Award, Brain, Briefcase, FolderGit2, GraduationCap, Languages, Star, User, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { mmToPx, PAGE, TEMPLATES, type ResumeContent, type ResumeDesign, type ResumeEntry, type ResumeSection, type SectionKind } from '@/lib/resume';

/*
 * Single-column resume renderer, verified line by line against the reference CV export: DOM structure, inline styles,
 * the spacing formulas and tables below, the entry header measuring rules and the page packing all match it. Every box
 * (icons, bullets, line boxes) lands on the same pixel; glyph baselines can differ by 1px between operating systems'
 * font engines, so compare PDFs printed on Linux (production) — macOS draws text 1px lower.
 */
const SF_ENTRIES = [1, 1.15, 1.3, 1.45, 1.6];
const SF_HEADINGS = [1, 1.08, 1.16, 1.24, 1.32];
const SF_SECTION_BOTTOM = [1, 1.18, 1.36, 1.54, 1.72];

const ptPx = (pt: number) => (pt / 3) * 4;
const lineHeightPx = (lh: number, pt: number) => Math.round(lh * ptPx(pt));
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
/** Date column percentage, capped */
const datePct = (n: number) => { const t = round4(n); return t > 55 ? 40 : t; };

const ICONS: Record<SectionKind, LucideIcon> = {
  summary: User, skills: Brain, experience: Briefcase, education: GraduationCap, projects: FolderGit2, certificates: Award, languages: Languages, custom: Star,
};

function geometry(d: ResumeDesign) {
  const t = (TEMPLATES[d.template] ?? TEMPLATES['classic-serif']).tokens;
  const s = d.fontScale || 1;
  const base = t.basePt * s, title = t.titlePt * s, lh = t.lineHeight, sf = t.spacing;
  const delta = Math.max(title - base, 0);
  const logLh = Math.log2(1 + Math.log2(1 + lh));
  const page = PAGE[d.pageFormat] ?? PAGE.A4;
  const margin = mmToPx(d.marginMm);
  const entryBottom = Math.round((0.5 * lh * SF_ENTRIES[sf] + 0.12 * delta) * ptPx(base));
  const padTop = margin - 2, padBottom = margin - entryBottom;
  return {
    t, page, margin, padTop, padBottom, base, title, delta,
    name: t.namePt * s, jobTitle: t.jobTitlePt * s, heading: t.headingPt * s,
    bodyLh: lineHeightPx(lh, base), titleLh: lineHeightPx(lh, title), headingLh: lineHeightPx(lh, t.headingPt * s),
    nameLh: Math.round(logLh * ptPx(t.namePt * s)), jobTitleLh: Math.round(logLh * ptPx(t.jobTitlePt * s)),
    entryBottom,
    sectionBottom: Math.round((0.6 * lh * SF_SECTION_BOTTOM[sf] + 0.09 * delta + 0.18 * lh * SF_SECTION_BOTTOM[sf] + (t.headingStyle === 'simple' ? 0.3 * lh : 0)) * ptPx(base)),
    headingMarginEm: 0.4 * lh * SF_HEADINGS[sf] + 0.04 * delta,
    headerPadEm: 0.5 * lh * 1.15 * SF_SECTION_BOTTOM[sf],
    listGapEm: 0.75 * lh * Math.sqrt(SF_ENTRIES[sf]),
    contentW: page.w - 2 * margin,
    limit: page.h - padTop - padBottom,
  };
}
type Geo = ReturnType<typeof geometry>;

const range = (e: ResumeEntry) => [e.start, e.end].filter(Boolean).join(' – ');
const safeHref = (u: string) => (/^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : undefined);
const words = (s: string) => s.split(' ');
const hasTitle = (k: SectionKind) => k === 'experience' || k === 'education' || k === 'projects' || k === 'custom';
const listKind = (k: SectionKind) => k === 'certificates' || k === 'languages';

/** Natural widths measured before laying out an entry header. */
interface HeaderMetrics { dateW: number; titleWords: number[]; subWords: number[] }

function useFontsReady(family: string) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 16px ${family}`))).then(() => document.fonts.ready).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [family]);
  return ready;
}

// ── pieces ───────────────────────────────────────────────────────────────────────────────────────────────────────

function TitleWords({ title, comma }: { title: string; comma: boolean }) {
  const w = words(title);
  return <>{w.map((x, i) => <span key={i} style={{ fontWeight: 'bold', display: 'inline-block', whiteSpace: 'pre-wrap' }}>{i === w.length - 1 ? <>{x}{comma ? ', ' : null}</> : `${x} `}</span>)}</>;
}
function SubWords({ sub }: { sub: string }) {
  const w = words(sub);
  return <>{w.map((x, i) => <span key={i} style={{ whiteSpace: 'pre-wrap', display: 'inline-block' }}>{i === w.length - 1 ? x : `${x} `}</span>)}</>;
}
function DateLocation({ e, g, probe }: { e: ResumeEntry; g: Geo; probe?: boolean }) {
  const date = range(e), loc = e.location;
  const parts = [date && <span key="d" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 'normal', fontStyle: 'normal', fontVariantLigatures: 'normal', textAlign: 'end' }}>{date}</span></span>,
    date && loc && <span key="s" style={{ whiteSpace: 'pre', paddingInline: '0.2em', flexShrink: 0 }}> | </span>,
    loc && <span key="l" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 'normal', fontStyle: 'normal', textAlign: 'end' }}>{loc}</span></span>];
  const box: CSSProperties = probe
    ? { display: 'inline-block', whiteSpace: 'nowrap', width: 'max-content', paddingInlineStart: '1.5em', boxSizing: 'border-box', lineHeight: `${g.titleLh}px`, fontSize: `${g.title}pt` }
    : { display: 'flex', flexFlow: 'row', paddingInlineStart: '1.5em', boxSizing: 'border-box', width: '100%', justifyContent: 'flex-end', lineHeight: `${g.titleLh}px`, fontSize: `${g.title}pt` };
  return <span data-probe={probe ? 'date' : undefined} style={box}>{parts}</span>;
}

/** Entry header: auto title/date split, then "try same line" for the subtitle. */
function EntryHeader({ e, g, m }: { e: ResumeEntry; g: Geo; m?: HeaderMetrics }) {
  const hasMeta = !!(range(e) || e.location);
  const sub = e.subtitle.trim();
  let titlePct = 100, datePctV = 0, placement: 'trySameLine' | 'nextLine' = 'trySameLine';
  const y = Math.round(g.contentW); // the row's offsetWidth
  if (hasMeta && m) {
    const titleW = m.titleWords.reduce((a, b) => a + b, 0), subW = m.subWords.reduce((a, b) => a + b, 0);
    const sameLine = Math.ceil(titleW + (subW > 0 ? subW + 1.5 : 0));
    const subWidth = Math.ceil(subW);
    datePctV = round4(datePct((m.dateW / y) * 100));
    titlePct = round4(100 - datePctV);
    if (subWidth > 0 && sameLine + m.dateW > y && subWidth <= y - (y * datePct((m.dateW / y) * 100)) / 100) placement = 'nextLine';
  } else if (hasMeta) { titlePct = 55; datePctV = 45; }
  // trySameLine: the subtitle drops below only if it does not fit after the last title line but fits a full line
  let block = false;
  if (placement === 'trySameLine' && sub && m) {
    const t = Math.round((g.contentW * titlePct) / 100);
    let line = 0;
    for (const w of m.titleWords) { line += w; if (line > t) line = w; }
    const o = m.subWords.reduce((a, b) => a + b, 0) + 1.5;
    block = t - line < o && o < t;
  }
  const titleHref = e.url && safeHref(e.url);
  const comma = placement === 'trySameLine' && !!sub;
  const titleNode = titleHref ? <a href={titleHref} style={{ color: 'inherit', textDecoration: 'none' }}><TitleWords title={e.title} comma={comma} /></a> : <TitleWords title={e.title} comma={comma} />;
  const subNode = sub ? <span style={{ display: placement === 'trySameLine' ? (block ? 'block' : 'inline') : undefined, fontWeight: 'normal', fontStyle: 'normal' }}><SubWords sub={sub} /></span> : null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div style={hasMeta ? { flex: `0 0 ${titlePct}%`, maxWidth: `${titlePct}%` } : { width: '100%' }}>
        <div style={{ width: '100%', fontSize: `${g.title}pt`, lineHeight: `${g.titleLh}px`, paddingBottom: `${g.delta}px` }}>
          {placement === 'trySameLine' ? <>{titleNode}{subNode}</> : <><p>{titleNode}</p>{subNode}</>}
        </div>
      </div>
      {hasMeta && <div style={{ flex: `0 0 ${datePctV}%`, maxWidth: `${datePctV}%`, display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}><DateLocation e={e} g={g} /></div>}
    </div>
  );
}

function Bullet({ text, g, color }: { text: string; g: Geo; color: string }) {
  return (
    <li style={{ display: 'flex', whiteSpace: 'pre-wrap' }}>
      <div style={{ paddingInlineStart: '0.12em', width: '0.9em', minWidth: '0.9em', display: 'flex', alignItems: 'center', height: g.bodyLh, transform: `translateY(${g.t.bulletNudgeEm}em)` }}>
        <svg viewBox="0 0 20 20" width="4px" height="4px" aria-hidden><circle fill={color} cx="10" cy="10" r="10" /></svg>
      </div>
      {/* a 1px "•" stays in the text layer so ATS parsers still see list items */}
      <span style={{ display: 'inline-block' }}><span style={{ fontSize: '1px', color: 'white', width: 0, maxWidth: 0, minWidth: 0, height: 0, maxHeight: 0, minHeight: 0, display: 'inline-block' }}>•</span>{text}</span>
    </li>
  );
}

/** One page element: header | spacer | heading | entry | sectionBottomSpace. */
interface El { key: string; kind: 'header' | 'spacer' | 'heading' | 'entry' | 'sectionBottomSpace'; node: ReactNode }

function buildElements(c: ResumeContent, d: ResumeDesign, g: Geo, metrics: Map<string, HeaderMetrics>): El[] {
  const accent = d.accent, text = '#000000';
  const h = c.header;
  const link: CSSProperties = { overflowWrap: 'break-word', textDecoration: 'none', color: text, minWidth: 0, display: 'flex', alignItems: 'center', paddingBottom: '0.86em' };
  const item = (key: string, content: ReactNode, href?: string) => {
    const inner = <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ display: 'inline', overflowWrap: key === 'email' ? 'normal' : 'anywhere' }}>{content}</span><span style={{ fontSize: '1px' }}> </span></span>;
    return href ? <a key={key} href={href} style={link}>{inner}</a> : <span key={key} style={link}>{inner}</span>;
  };
  const [local, domain] = h.email.split('@');
  const details = [
    h.email && item('email', domain !== undefined ? <>{local}<wbr />@{domain}</> : h.email, `mailto:${h.email}`),
    h.phone && item('phone', h.phone, `tel:${h.phone.replace(/[^\d+]/g, '')}`),
    ...h.links.map((l, i) => (l.label || l.url) && item(`l${i}`, l.label || l.url.replace(/^https?:\/\/(www\.)?/, ''), safeHref(l.url))),
    h.location && item('loc', h.location),
  ].filter(Boolean) as ReactNode[];
  const delimiter = (i: number) => (
    <span key={`d${i}`} style={{ padding: '0px 0.7em', display: 'flex' }}>
      <span style={{ color: text, display: 'flex', justifyContent: 'center', alignItems: 'center', height: g.bodyLh, paddingTop: 1, marginTop: '-0.04em' }}>|</span>
    </span>
  );

  const els: El[] = [{
    key: 'header', kind: 'header',
    node: (
      <div style={{ width: '100%', paddingBottom: `${g.headerPadEm}em`, lineHeight: `${g.bodyLh}px`, fontSize: `${g.base}pt`, whiteSpace: 'pre-wrap' }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'flex-start' }}>
          <div style={{ width: '100%', flexGrow: 1 }}>
            <div style={{ width: '100%', color: text, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingBottom: '0.52em', marginBottom: '0.3em' }}>
              <span style={{ fontWeight: 700, fontSize: `${g.name}pt`, color: accent, lineHeight: `${g.nameLh}px`, overflowWrap: 'anywhere', paddingBottom: '0.2em' }}>{h.fullName}</span>
              {h.headline && <span style={{ fontStyle: 'normal', fontWeight: 'normal', fontSize: `${g.jobTitle}pt`, lineHeight: `${g.jobTitleLh}px`, color: accent, overflowWrap: 'anywhere', paddingBottom: '0.16em'}}>{h.headline}</span>}
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ width: '100%' }}><div style={{ display: 'flex', flexWrap: 'wrap' }}>{details.map((x, i) => <Fragment key={i}>{i > 0 && delimiter(i)}{x}</Fragment>)}</div></div>
            </div>
          </div>
        </div>
      </div>
    ),
  }, { key: 'spacer', kind: 'spacer', node: <div style={{ height: 0 }} /> }];

  const heading = (sec: ResumeSection) => {
    const icon = d.icons?.[sec.kind];
    const Fallback = ICONS[sec.kind];
    return (
      <div style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: `${g.heading}pt`, lineHeight: `${g.headingLh}px`, color: accent }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', marginBottom: `${g.headingMarginEm}em`, gap: '0.5em', ...(g.t.headingStyle === 'line' && { borderBottom: `2px solid ${accent}` }) }}>
          {d.headingIcons && (
            <div><span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '1.2em' }}><span style={{ display: 'flex', height: '1.1em', width: '1.1em', justifyContent: 'center', alignItems: 'center' }}>
              {icon
                ? <svg xmlns="http://www.w3.org/2000/svg" viewBox={icon.viewBox} style={{ height: '1em', width: 'auto', fill: accent, stroke: accent }} aria-hidden><path d={icon.d} /></svg>
                : <Fallback aria-hidden style={{ height: '1em', width: '1em' }} strokeWidth={2} />}
            </span></span></div>
          )}
          <span>{sec.title}</span>
        </div>
      </div>
    );
  };
  const body: CSSProperties = { width: '100%', whiteSpace: 'pre-wrap', lineHeight: `${g.bodyLh}px`, wordBreak: 'break-word', fontSize: `${g.base}pt` };
  const indented: CSSProperties = { ...body, paddingInlineStart: '0.8em' };

  for (const sec of c.sections) {
    if (sec.hidden) continue;
    const paragraphs = sec.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const groups = sec.groups.filter((x) => x.label.trim() || x.items.some((i) => i.trim()));
    const entries = sec.entries.filter((e) => e.title.trim() || e.subtitle.trim() || e.description.trim() || e.bullets.some((b) => b.trim()));
    if (!paragraphs.length && !groups.length && !entries.length) continue;
    const id = sec.id ?? sec.kind;
    els.push({ key: `${id}-h`, kind: 'heading', node: sec.title.trim() ? heading(sec) : <div style={{ width: '100%' }} /> });
    if (paragraphs.length) els.push({ key: `${id}-p`, kind: 'entry', node: <div style={{ width: '100%' }}><div style={body}>{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div></div> });
    if (groups.length) {
      els.push({
        key: `${id}-g`, kind: 'entry',
        node: (
          <div style={{ whiteSpace: 'pre-wrap' }}><div style={{ width: '100%' }}>
            {groups.map((x, i) => {
              const label = x.label.trim().replace(/:?$/, ':');
              const items = x.items.map((v) => v.trim()).filter(Boolean).join(', ');
              return (
                <div key={x.id ?? i} style={i ? { marginTop: '0.5em' } : undefined}>
                  {x.label.trim() && <span style={{ overflowWrap: 'break-word', color: 'inherit', fontWeight: 'bold', fontSize: `${g.title}pt`, lineHeight: `${g.titleLh}px` }}>{label}</span>}
                  {items && <span style={{ whiteSpace: 'normal', fontSize: `${g.base}pt`, overflowWrap: 'break-word', fontWeight: 'normal' }}>{x.label.trim() ? ' — ' : ''}{items}</span>}
                </div>
              );
            })}
          </div></div>
        ),
      });
    }
    if (entries.length && listKind(sec.kind)) {
      els.push({
        key: `${id}-l`, kind: 'entry',
        node: (
          <div style={{ width: '100%' }}>
            {entries.map((e, i) => {
              const name = `${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}${e.end ? ` (${e.end})` : ''}`;
              const info = [e.description.trim(), ...e.bullets.map((b) => b.trim()).filter(Boolean)].filter(Boolean);
              return (
                <div key={e.id ?? i} style={{ display: 'flex', flexDirection: 'column', fontSize: `${g.title}pt`, marginBottom: i < entries.length - 1 ? `${g.listGapEm}em` : undefined }}>
                  <span style={{ overflowWrap: 'break-word', color: 'inherit', fontWeight: 'bold', fontSize: `${g.title}pt`, lineHeight: `${g.titleLh}px` }}>{name}</span>
                  {!!info.length && <div style={indented}>{info.map((p, j) => <p key={j}>{p}</p>)}</div>}
                </div>
              );
            })}
          </div>
        ),
      });
    } else if (entries.length) {
      entries.forEach((e, ei) => {
        const tags: ReactNode[] = [
          ...e.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={`p${i}`}>{p}</p>),
          ...e.bullets.map((b) => b.trim()).filter(Boolean).map((b, i) => <Bullet key={`b${i}`} text={b} g={g} color={text} />),
        ];
        const blocks = tags.length ? tags : [null];
        const ek = `${id}-${e.id ?? ei}`;
        blocks.forEach((tag, ti) => els.push({
          key: `${ek}-${ti}`, kind: 'entry',
          node: (
            <div style={{ width: '100%' }}><div style={{ width: '100%', wordBreak: 'break-word' }}>
              <div style={{ width: '100%', display: 'flex', lineHeight: `${g.bodyLh}px`, flexDirection: 'column', ...(ti === blocks.length - 1 && ei < entries.length - 1 && { paddingBottom: `${g.entryBottom}px` }) }}>
                {ti === 0 && hasTitle(sec.kind)
                  ? <EntryHeader e={e} g={g} m={metrics.get(ek)} />
                  : <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ width: '100%' }}><div style={{ width: '100%', fontSize: `${g.title}pt`, lineHeight: `${g.titleLh}px`, paddingBottom: `${g.delta}px` }} /></div><div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}><span style={{ display: 'flex', flexFlow: 'row', justifyContent: 'flex-end', lineHeight: `${g.titleLh}px`, fontSize: `${g.title}pt` }} /></div></div>}
                {tag && <div style={{ width: '100%' }}><div style={indented}>{tag}</div></div>}
              </div>
            </div></div>
          ),
        }));
      });
    }
    els.push({ key: `${id}-b`, kind: 'sectionBottomSpace', node: <div style={{ width: '100%' }}><div style={{ height: g.sectionBottom }} /></div> });
  }
  return els;
}

/** Page packing: a heading travels with the next element; a section spacer never starts a page. */
export function paginate(els: Pick<El, 'kind'>[], heights: number[], limit: number): number[][] {
  const pages: number[][] = [[]];
  let used = 0, pending: number | null = null;
  els.forEach((e, i) => {
    if (e.kind === 'heading') { pending = i; return; }
    const n = heights[i] + (pending !== null ? heights[pending] : 0);
    if (used + n > limit && pages[pages.length - 1].length) { pages.push([]); used = 0; }
    if (used === 0 && e.kind === 'sectionBottomSpace' && heights[i] !== 0) return;
    if (pending !== null) { pages[pages.length - 1].push(pending); pending = null; }
    used += n;
    pages[pages.length - 1].push(i);
  });
  return pages.filter((p) => p.length);
}

/**
 * The resume as real pages; the editor preview and the print page (which Playwright turns into the PDF) both use this,
 * so they are identical. `onRendered` fires once fonts are loaded and pages are laid out.
 */
export function ResumePages({ content, design, onRendered, pageGap = 24 }: { content: ResumeContent; design: ResumeDesign; onRendered?: (pages: number) => void; pageGap?: number }) {
  const g = useMemo(() => geometry(design), [design]);
  const fontsReady = useFontsReady(g.t.font);
  const [metrics, setMetrics] = useState<Map<string, HeaderMetrics>>(new Map());
  const [laid, setLaid] = useState<{ pages: number[][]; els: El[] } | null>(null);
  const [mounted, setMounted] = useState(false);
  const probeRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  const headers = useMemo(() => content.sections.filter((s) => !s.hidden && hasTitle(s.kind)).flatMap((s) => s.entries
    .map((e, ei) => ({ key: `${s.id ?? s.kind}-${e.id ?? ei}`, e }))
    .filter(({ e }) => e.title.trim() || e.subtitle.trim())), [content]);
  const els = useMemo(() => (fontsReady ? buildElements(content, design, g, metrics) : []), [content, design, g, metrics, fontsReady]);

  // pass 1: natural widths of every entry header (measured in a hidden root before splitting the row)
  useLayoutEffect(() => {
    const root = probeRef.current;
    if (!fontsReady || !root) return;
    const next = new Map<string, HeaderMetrics>();
    root.querySelectorAll<HTMLElement>('[data-entry]').forEach((el) => {
      const date = el.querySelector<HTMLElement>('[data-probe="date"]');
      next.set(el.dataset.entry!, {
        dateW: date ? date.scrollWidth : 0,
        titleWords: [...el.querySelectorAll<HTMLElement>('[data-tw] > span')].map((s) => s.offsetWidth),
        subWords: [...el.querySelectorAll<HTMLElement>('[data-sw] > span')].map((s) => s.offsetWidth),
      });
    });
    setMetrics((prev) => (JSON.stringify([...prev]) === JSON.stringify([...next]) ? prev : next));
  }, [headers, g, fontsReady, mounted]);

  // pass 2: element heights → pages
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!fontsReady || !root || root.children.length !== els.length) return;
    const heights = [...root.children].map((el) => el.getBoundingClientRect().height);
    setLaid({ pages: paginate(els, heights, g.limit), els });
  }, [els, fontsReady, g, mounted]);

  // report only a layout of the current elements, built from measured entry headers (the PDF is printed when this fires)
  const pages = laid?.els === els ? laid.pages : null;
  const measured = headers.every(({ key }) => metrics.has(key));
  useEffect(() => { if (pages && fontsReady && measured) onRendered?.(pages.length); }, [pages, fontsReady, measured, onRendered]);

  const pageStyle: CSSProperties = {
    position: 'relative', overflow: 'hidden', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', lineHeight: `${g.bodyLh}px`, fontSize: `${g.base}pt`,
    fontFamily: g.t.font, fontStretch: 'normal', textRendering: 'geometricPrecision', fontVariantLigatures: 'none', color: '#000', width: g.page.w, height: g.page.h, flex: 'none',
  };
  const contentStyle: CSSProperties = { display: 'flex', flexDirection: 'column', flexGrow: 1, paddingTop: g.padTop, paddingInline: g.margin, paddingBottom: g.padBottom, backgroundColor: '#fff', color: '#000' };
  const footer = (n: number, total: number) => design.footer && (
    <div style={{ display: 'flex', alignItems: 'center', position: 'absolute', height: g.margin, bottom: 0, color: '#000', fontSize: '90%', zIndex: 2, justifyContent: 'space-between', left: g.margin, right: g.margin, opacity: 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '33%' }}><bdi>{content.header.fullName}</bdi></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '33%' }}><bdi dir="ltr">{content.header.email}</bdi></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '33%' }}><bdi dir="ltr">{n} / {total}</bdi></div>
    </div>
  );
  const hidden: CSSProperties = { position: 'absolute', left: -100000, top: 0, height: 0, overflow: 'hidden', visibility: 'hidden' };

  return (
    <div className="resume-pages" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pageGap }}>
      {mounted && createPortal(
        <div aria-hidden style={hidden}>
          <div ref={probeRef} style={{ ...pageStyle, height: 'auto' }}>
            {headers.map(({ key, e }) => (
              <div key={key} data-entry={key}>
                {(range(e) || e.location) && <DateLocation e={e} g={g} probe />}
                <div style={{ whiteSpace: 'nowrap', width: 'max-content', fontSize: `${g.title}pt`, lineHeight: `${g.titleLh}px` }}>
                  <span data-tw><TitleWords title={e.title} comma={!!e.subtitle.trim()} /></span>
                  {e.subtitle.trim() && <span data-sw><SubWords sub={e.subtitle.trim()} /></span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...pageStyle, height: 'auto' }}>
            <div ref={measureRef} style={{ ...contentStyle, paddingTop: 0, paddingBottom: 0 }}>{els.map((el) => <div key={el.key} style={{ display: 'flow-root' }}>{el.node}</div>)}</div>
          </div>
        </div>,
        document.body,
      )}
      {pages?.map((idxs, p) => (
        <div key={p} className="resume-page" style={{ ...pageStyle, boxShadow: pageGap ? '0 1px 4px rgba(0,0,0,.18)' : undefined }}>
          <div style={contentStyle}>{idxs.map((i) => els[i] && <div key={els[i].key} style={{ display: 'flow-root' }}>{els[i].node}</div>)}</div>
          {footer(p + 1, pages.length)}
        </div>
      ))}
    </div>
  );
}
