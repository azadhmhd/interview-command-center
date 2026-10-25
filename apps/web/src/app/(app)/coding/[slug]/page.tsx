'use client';
import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Lightbulb, Play, RotateCcw, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, LinkButton, Loading, Markdown, PageHeader, Progress, Tabs, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { canon, Lang, Problem, Review, RunOutput, runTests, Submission, testsUpTo, warmUp } from '@/lib/coding';
import { DIFF_TONE, type Section } from '@/lib/sections';
import { relTime } from '@/lib/utils';

const LANGS: { value: Lang; label: string }[] = [{ value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }];
const draftKey = (slug: string, lang: Lang) => `icc-coding:${slug}:${lang}`;
const readDraft = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeDraft = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: drafts just are not kept */ } };
const show = (v: unknown) => (v === undefined ? '—' : JSON.stringify(v));

/** Plain code editor: line numbers, Tab indents, Ctrl/Cmd+Enter runs. */
function Editor({ value, onChange, onRun, indent }: { value: string; onChange: (v: string) => void; onRun: () => void; indent: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;
  return (
    <div className="flex h-[420px] overflow-hidden rounded-lg border border-border bg-bg font-mono text-[13px] leading-5">
      <div ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-border px-2 py-3 text-right text-muted">
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea ref={ref} value={value} spellCheck={false} aria-label="Code editor"
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onRun(); return; }
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const el = e.currentTarget, s = el.selectionStart, end = el.selectionEnd;
            onChange(value.slice(0, s) + indent + value.slice(end));
            requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + indent.length; });
          }
        }}
        className="flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 text-text outline-none" />
    </div>
  );
}

function ReviewPanel({ r }: { r: Review }) {
  const tone = r.verdict === 'solved' ? 'success' : r.verdict === 'partially_solved' ? 'warning' : 'danger';
  const areas: [string, number][] = [['Correctness', r.scores.correctness], ['Approach', r.scores.approach], ['Verification', r.scores.verification], ['Code quality', r.scores.codeQuality], ['Communication', r.scores.communication]];
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={tone}>{r.verdict.replace('_', ' ')}</Badge><span className="text-2xl font-bold tabular-nums">{r.score}<span className="text-sm text-muted">/10</span></span><span className="text-xs text-muted">confidence: {r.confidence}</span></div>
      <p>{r.summary}</p>
      <div className="grid gap-2 sm:grid-cols-5">{areas.map(([k, v]) => <div key={k}><div className="flex justify-between text-xs"><span className="text-muted">{k}</span><span className="tabular-nums">{v}</span></div><Progress value={v * 10} className="mt-1" /></div>)}</div>
      {!!r.strengths.length && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Strengths</p><ul className="list-disc space-y-0.5 pl-5">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      {!!r.issues.length && (
        <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Issues</p>
          <ul className="space-y-2">{r.issues.map((i, k) => (
            <li key={k} className="rounded-md bg-surface-2 p-2"><div className="flex items-center gap-2"><Badge tone={i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warning' : 'neutral'}>{i.severity}</Badge>{i.line && <span className="font-mono text-xs text-muted">line {i.line}</span>}</div><p className="mt-1">{i.problem}</p><p className="mt-0.5 text-muted">Fix: {i.fix}</p></li>
          ))}</ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {!!r.edgeCases.length && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Edge cases</p><ul className="list-disc space-y-0.5 pl-5">{r.edgeCases.map((s) => <li key={s}>{s}</li>)}</ul></div>}
        <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Complexity</p><p>Time: <span className="font-mono">{r.complexity.time}</span></p><p>Space: <span className="font-mono">{r.complexity.space}</span></p></div>
      </div>
      {!!r.suggestions.length && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Next steps</p><ol className="list-decimal space-y-0.5 pl-5">{r.suggestions.map((s) => <li key={s}>{s}</li>)}</ol></div>}
      {!!r.interviewTips.length && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Interview tips</p><ul className="list-disc space-y-0.5 pl-5">{r.interviewTips.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      <details className="rounded-md border border-border"><summary className="cursor-pointer px-3 py-2 text-xs font-medium">Reviewer&apos;s solution</summary><pre className="overflow-x-auto border-t border-border p-3 font-mono text-xs">{r.improvedSolution}</pre></details>
    </div>
  );
}

export default function Sandbox() {
  const { slug } = useParams<{ slug: string }>();
  const { data: p, error, isLoading } = useApi<Problem>(`/coding/problems/${slug}`);
  const { data: subs, mutate: reloadSubs } = useApi<Submission[]>(`/coding/submissions?slug=${slug}`);
  const { data: sections } = useApi<Section[]>('/coding/sections');
  const [lang, setLang] = useState<Lang>('python');
  const [code, setCode] = useState('');
  const stage = 1; // ponytail: every problem has one stage; the data format still allows more
  const [notes, setNotes] = useState('');
  const [out, setOut] = useState<RunOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [hints, setHints] = useState(0);
  const [watching, setWatching] = useState<string | null>(null);
  const { busy, run } = useAction();

  // load the saved draft (or the starter) when the problem or language changes
  useEffect(() => {
    if (!p) return;
    setCode(readDraft(draftKey(p.slug, lang)) ?? p.starter[lang]);
    setOut(null);
    warmUp(lang);
  }, [p, lang]);
  useEffect(() => { if (p) writeDraft(draftKey(p.slug, lang), code); }, [p, lang, code]);

  const { data: watched } = useApi<Submission>(watching ? `/coding/submissions/${watching}` : null, { refreshInterval: 4000 });
  useEffect(() => {
    if (watched && (watched.review || ['failed', 'cancelled', 'ready_for_agent'].includes(watched.task?.state ?? ''))) { setWatching(null); reloadSubs(); refresh('/coding/sections'); }
  }, [watched, reloadSubs]);

  const tests = useMemo(() => (p ? testsUpTo(p, stage) : []), [p, stage]);
  const runNow = useCallback(async () => {
    if (!p || running) return;
    setRunning(true);
    try {
      const res = await runTests(p, lang, code, stage);
      setOut(res);
      // an all-green run is saved, which marks the problem done
      if (res.results.length && res.results.every((r) => r.passed)) {
        api('/coding/submissions', { body: { slug: p.slug, language: lang, stage, code, review: false, results: res.results.map(({ name, passed: ok }) => ({ name, passed: ok })) } }).then(() => { reloadSubs(); refresh('/coding/sections'); }, () => undefined);
      }
    } catch (e) { setOut({ results: [], logs: [], error: (e as Error).message }); } finally { setRunning(false); }
  }, [p, lang, code, stage, running, reloadSubs]);

  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorBox error={error ?? new Error('Problem not found')} />;
  const passed = out?.results.filter((r) => r.passed).length ?? 0;
  const latestReview = subs?.find((s) => s.review);
  // previous and next problem in catalog order, across sections
  const order = sections?.flatMap((s) => s.problems) ?? [];
  const at = order.findIndex((x) => x.slug === p.slug);
  const prev = at > 0 ? order[at - 1] : undefined, next = at >= 0 ? order[at + 1] : undefined;
  const pending = subs?.find((s) => s.task && !s.review && !['failed', 'cancelled', 'completed'].includes(s.task.state));

  const submit = (review: boolean) => run(review ? 'review' : 'save', async () => {
    const res = out ?? (await runTests(p, lang, code, stage));
    setOut(res);
    const r = await api<{ submission: Submission }>('/coding/submissions', { body: { slug: p.slug, language: lang, stage, code, notes: notes || undefined, review, results: res.results.map(({ name, passed: ok, got, error: err }) => ({ name, passed: ok, got, error: err })) } });
    reloadSubs(); refresh('/coding/sections');
    if (review) setWatching(r.submission.id);
    return r;
  }, review ? 'Sent for AI review: Claude Code (or your LLM) is reading your code' : 'Run saved');

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/coding/sections/${p.topic}`, label: p.pattern }} title={p.title}
        description={<span className="flex flex-wrap items-center gap-1.5"><Badge>{p.pattern}</Badge><Badge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</Badge><Badge>~{p.minutes} min</Badge><span className="text-muted">{p.summary}</span></span>}
        actions={(prev || next) && <>
          {prev && <LinkButton href={`/coding/${prev.slug}`} variant="outline" size="sm"><ChevronLeft className="h-3.5 w-3.5" /><span className="max-w-40 truncate" title={prev.title}>{prev.title}</span></LinkButton>}
          {next && <LinkButton href={`/coding/${next.slug}`} variant="outline" size="sm"><span className="max-w-40 truncate" title={next.title}>{next.title}</span><ChevronRight className="h-3.5 w-3.5" /></LinkButton>}
        </>} />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* problem */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Problem" />
            <div className="space-y-3 p-4 text-sm">
              <Markdown>{p.scenario}</Markdown>
              <p className="text-xs text-muted">{p.entry[lang] === 'solve'
                ? <>Write the function named above in {lang === 'python' ? 'Python' : 'JavaScript'}. The starter builds the nodes for you; leave its test glue (<code className="rounded bg-surface-2 px-1">solve</code>) as it is.</>
                : <>Implement {p.kind === 'class' ? 'the class' : 'the function'} <code className="rounded bg-surface-2 px-1">{p.entry[lang]}</code> in {lang === 'python' ? 'Python' : 'JavaScript'}.</>}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Hints" description="Reveal one at a time, only when stuck." action={hints < p.hints.length && <Button size="sm" variant="outline" onClick={() => setHints(hints + 1)}><Lightbulb className="h-3.5 w-3.5" />Show a hint</Button>} />
            <div className="space-y-2 p-4 text-sm">
              {p.hints.slice(0, hints).map((h, i) => <p key={h}><span className="text-muted">{i + 1}.</span> {h}</p>)}
              {!hints && <p className="text-muted">No hints shown yet.</p>}
            </div>
          </Card>
          {!!p.aiTips.length && (
            <Card>
              <CardHeader title="Driving the AI on this problem" />
              <ul className="list-disc space-y-1 p-4 pl-8 text-sm">{p.aiTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
            </Card>
          )}
        </div>

        {/* sandbox */}
        <div className="space-y-4">
          <Card className="p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Tabs value={lang} onChange={setLang} items={LANGS} />
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { if (confirm('Replace your code with the starter code?')) setCode(p.starter[lang]); }}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
                <Button size="sm" loading={running} onClick={runNow}><Play className="h-3.5 w-3.5" />Run tests</Button>
              </div>
            </div>
            <Editor value={code} onChange={setCode} onRun={runNow} indent={lang === 'python' ? '    ' : '  '} />
            <p className="mt-1.5 text-[11px] text-muted">Ctrl/⌘ + Enter runs · code runs in your browser only{lang === 'python' ? ' · Python loads once (a few seconds the first time)' : ''} · drafts are kept on this device</p>
          </Card>

          <Card>
            <CardHeader title={out ? `Tests: ${passed}/${out.results.length} passed` : `Tests (${tests.length})`}
              description={out?.error ? undefined : !out ? 'Run the tests to see results.' : out.results.length && passed === out.results.length ? 'All green: ask for an AI review, or try the next problem.' : `${out.results.length - passed} failing: open a test to compare expected and actual.`} />
            <div className="space-y-1.5 p-4 text-sm">
              {out?.error && <p className="whitespace-pre-wrap rounded-md bg-danger-soft p-2 font-mono text-xs text-danger">{out.error}</p>}
              {(out?.results.length ? out.results : tests.map((t) => ({ name: t.name, stage: t.stage, passed: undefined as boolean | undefined }))).map((r, i) => {
                const test = tests[i];
                return (
                  <details key={`${r.stage}-${r.name}`} className="rounded-md border border-border">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                      {r.passed === true ? <CheckCircle2 className="h-4 w-4 text-success" /> : r.passed === false ? <XCircle className="h-4 w-4 text-danger" /> : <span className="h-4 w-4 rounded-full border border-border" />}
                      <span className="flex-1">{r.name}</span>
                    </summary>
                    <div className="space-y-1 border-t border-border px-3 py-2 font-mono text-xs">
                      {test?.ops ? test.ops.map(([m, args, exp], k) => <p key={k}>{m === 'new' ? `new ${p.entry[lang]}(${args.map(show).join(', ')})` : `.${m}(${args.map(show).join(', ')})`}{exp !== undefined && ` → ${show(exp)}`}</p>)
                        : <><p><span className="text-muted">input:</span> {test?.args?.map(show).join(', ')}</p><p><span className="text-muted">expected:</span> {show(test?.expected)}</p></>}
                      {'got' in r && r.got !== undefined && !test?.ops && <p className={r.passed ? 'text-success' : 'text-danger'}><span className="text-muted">got:</span> {show(r.got)}{!r.passed && canon(r.got) === canon(test?.expected) ? ' (same value, different type?)' : ''}</p>}
                      {'error' in r && typeof r.error === 'string' && r.error && <p className="whitespace-pre-wrap text-danger">{r.error}</p>}
                    </div>
                  </details>
                );
              })}
              {!!out?.logs.length && <details><summary className="cursor-pointer text-xs text-muted">Output ({out.logs.length} line{out.logs.length > 1 ? 's' : ''})</summary><pre className="mt-1 max-h-40 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-xs">{out.logs.join('\n')}</pre></details>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Your approach notes" description="Your plan, how you used the AI and what you checked. The review scores communication from this." />
            <div className="space-y-3 p-4">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-28 text-sm" placeholder={'Plan: BFS from S, stop at E…\nAI: asked it only for the neighbour loop, fixed its row/col swap…\nChecked: walls, no route, start next to end…'} />
              <div className="flex flex-wrap gap-2">
                <Button loading={busy === 'review'} disabled={!!pending || !!watching} onClick={() => submit(true)}><Bot className="h-4 w-4" />{pending || watching ? 'Review in progress…' : 'Get AI review'}</Button>
                <Button variant="outline" loading={busy === 'save'} onClick={() => submit(false)}>Save this run</Button>
              </div>
            </div>
          </Card>

          {(watching || pending) && !latestReview?.review && <Card className="p-4 text-sm text-muted">The reviewer is reading your code. This usually takes a minute or two; the result appears here.</Card>}
          {latestReview?.review && (
            <Card>
              <CardHeader title="AI review" description={`${latestReview.language} · ${relTime(latestReview.reviewedAt ?? latestReview.createdAt)}`} />
              <ReviewPanel r={latestReview.review} />
            </Card>
          )}
          {!!subs?.length && (
            <Card>
              <CardHeader title="Your runs" />
              <ul className="divide-y divide-border text-sm">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span>{s.language} · <span className={s.passed === s.total && s.total ? 'text-success' : 'text-muted'}>{s.passed}/{s.total} tests</span></span>
                    <span className="text-xs text-muted">{s.review ? `review ${s.review.score}/10` : s.task ? `review ${s.task.state.replace(/_/g, ' ')}` : ''} · {relTime(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
