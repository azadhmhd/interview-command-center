'use client';
import { Repeat, RotateCcw, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, refresh, useApi } from '@/lib/api';
import type { Attempt, Evaluation } from '@/lib/types';
import { uid } from '@/lib/utils';
import { Badge, Button, Field, Markdown, Spinner, Textarea, useAction } from './ui';

type Target = { lessonId: string; questionIndex: number } | { sessionId: string; questionIndex: number } | { canonicalQuestionId: string } | { occurrenceId: string };

interface AttemptView extends Attempt {
  previous?: Attempt | null;
  task?: { id: string; state: string; executionMethod?: string; routingReason?: string; lastError?: string } | null;
  modelAnswer?: string | null;
}

export function EvaluationView({ e }: { e: Evaluation }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">{e.score}/10</span>
        <Badge tone={e.source === 'self' ? 'neutral' : 'info'}>{e.source === 'self' ? 'self-assessed' : `${e.source} evaluation${e.model ? ` · ${e.model}` : ''}`}</Badge>
        <Badge>confidence: {e.confidence}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
        {Object.entries(e.rubric).map(([k, v]) => <div key={k} className="rounded bg-surface-2 px-2 py-1"><span className="text-muted">{k}</span> <strong className="tabular-nums">{v}</strong></div>)}
      </div>
      {!!e.missingConcepts.length && <p><span className="text-xs font-medium text-muted">Missing concepts:</span> {e.missingConcepts.join(', ')}</p>}
      {!!e.incorrectClaims.length && <div><p className="text-xs font-medium text-danger">Incorrect claims</p><ul className="list-disc pl-5">{e.incorrectClaims.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {!!e.improvements.length && <div><p className="text-xs font-medium text-muted">Improvements</p><ul className="list-disc pl-5">{e.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {!!e.followUps.length && <div><p className="text-xs font-medium text-muted">Likely follow-ups</p><ul className="list-disc pl-5">{e.followUps.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {e.strongAnswer && <details><summary className="cursor-pointer text-xs font-medium text-accent">Example of a strong answer</summary><Markdown className="mt-2">{e.strongAnswer}</Markdown></details>}
      <p className="text-[11px] text-muted">Coaching feedback — not a prediction of the hiring decision.</p>
    </div>
  );
}

function SelfEvaluation({ attemptId, onDone }: { attemptId: string; onDone: () => void }) {
  const [r, setR] = useState({ correctness: 5, completeness: 5, depth: 5, clarity: 5 });
  const [missing, setMissing] = useState('');
  const { busy, run } = useAction();
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted">No AI evaluator available right now. Compare with the model answer (if any) and score yourself — it feeds your revision schedule.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(r) as (keyof typeof r)[]).map((k) => (
          <label key={k} className="text-xs"><span className="text-muted">{k}: <strong>{r[k]}</strong></span><input type="range" min={0} max={10} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /></label>
        ))}
      </div>
      <Field label="What did you miss? (comma separated)"><input className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" value={missing} onChange={(e) => setMissing(e.target.value)} /></Field>
      <Button size="sm" loading={busy === 's'} onClick={async () => { if (await run('s', () => api(`/practice/attempts/${attemptId}/self-evaluation`, { body: { rubric: r, missingConcepts: missing.split(',').map((x) => x.trim()).filter(Boolean) } }), 'Self-evaluation saved')) onDone(); }}>Save self-evaluation</Button>
    </div>
  );
}

/** Submitted attempt: evaluation (polled while pending), self-evaluation fallback, comparison and actions. */
export function AttemptResult({ attemptId, onRetry }: { attemptId: string; onRetry?: () => void }) {
  const [showModel, setShowModel] = useState(false);
  const { busy, run } = useAction();
  const { data: view, mutate } = useApi<AttemptView>(`/practice/attempts/${attemptId}`, {
    refreshInterval: (d) => (d && !d.evaluation && d.task && ['queued', 'running', 'retry_wait'].includes(d.task.state) ? 2000 : 0),
  });
  if (!view) return <Spinner />;
  const pending = !view.evaluation && view.task && ['queued', 'running', 'retry_wait'].includes(view.task.state);
  // The evaluation already shows its strong answer; only offer a model answer that adds something.
  const model = view.modelAnswer && view.modelAnswer !== view.evaluation?.strongAnswer ? view.modelAnswer : null;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div><p className="text-xs font-medium text-muted">Your answer</p><Markdown>{view.answer}</Markdown></div>
      {view.evaluation ? <EvaluationView e={view.evaluation} />
        : pending ? <p className="flex items-center gap-2 text-sm text-muted"><Spinner />Evaluating with {view.task?.executionMethod === 'agent_cli' ? 'Claude Code (this can take a few minutes)' : 'the configured LLM'}…</p>
        : <>
          {view.task?.state === 'ready_for_agent' && <p className="text-xs text-muted">AI evaluation is waiting for an agent (<Link className="text-accent underline" href={`/tasks/${view.task.id}`}>task</Link>): {view.task.routingReason}</p>}
          {view.task?.state === 'failed' && <p className="text-xs text-danger">Evaluation failed: {view.task.lastError}</p>}
          <SelfEvaluation attemptId={view.id} onDone={() => mutate()} />
        </>}
      {view.previous && (
        <details className="text-sm"><summary className="cursor-pointer text-xs font-medium text-accent">Compare with previous attempt{view.previous.evaluation ? ` (${view.previous.evaluation.score}/10)` : ''}</summary>
          <div className="mt-2 rounded-md bg-surface-2 p-3"><Markdown>{view.previous.answer}</Markdown></div></details>
      )}
      <div className="flex flex-wrap gap-2">
        {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="h-3.5 w-3.5" />Retry</Button>}
        {model && <Button size="sm" variant="outline" onClick={() => setShowModel(!showModel)}>{showModel ? 'Hide' : 'Show'} model answer</Button>}
        <Button size="sm" variant="ghost" loading={busy === 'rev'} onClick={() => run('rev', () => api(`/practice/attempts/${view.id}/revise`, { method: 'POST' }), 'Added to revision queue')}><Repeat className="h-3.5 w-3.5" />Add to revision queue</Button>
      </div>
      {showModel && model && <div className="rounded-md bg-surface-2 p-3"><p className="mb-1 text-xs font-medium text-muted">Model answer</p><Markdown>{model}</Markdown></div>}
    </div>
  );
}

/** deferEvaluation: mock sessions only save the answer; feedback comes when the session is finished. */
export function PracticeBox({ target, prompt, revealedAnswer, hasModelAnswer, onAttempt, deferEvaluation }: { target: Target; prompt: string; revealedAnswer?: string; hasModelAnswer?: boolean; onAttempt?: () => void; deferEvaluation?: boolean }) {
  const [answer, setAnswer] = useState('');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [key, setKey] = useState(uid);
  const { busy, run } = useAction();

  const submit = async () => {
    const res = await run('submit', () => api<{ attempt: { id: string } }>('/practice/attempts', { body: { ...target, answer, clientKey: key } }));
    if (res) { setAttemptId(res.attempt.id); onAttempt?.(); refresh('/courses', '/revision', '/questions'); }
  };
  const retry = () => { setAttemptId(null); setAnswer(''); setShowModel(false); setKey(uid()); };

  if (attemptId && deferEvaluation) {
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        <div><p className="text-xs font-medium text-muted">Your answer</p><Markdown>{answer}</Markdown></div>
        <p className="text-xs text-muted">Saved. Feedback comes when you finish the session.</p>
        <Button size="sm" variant="outline" onClick={retry}><RotateCcw className="h-3.5 w-3.5" />Redo answer</Button>
      </div>
    );
  }
  if (attemptId) return <AttemptResult attemptId={attemptId} onRetry={retry} />;

  return (
    <div className="space-y-2">
      <Textarea aria-label={`Your answer to: ${prompt}`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer as you would in the interview…" className="min-h-28" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!answer.trim()} loading={busy === 'submit'} onClick={submit}><Send className="h-3.5 w-3.5" />Submit attempt</Button>
        {revealedAnswer ? <Button size="sm" variant="ghost" onClick={() => setShowModel(!showModel)}>{showModel ? 'Hide' : 'Show'} model answer (learning mode)</Button>
          : hasModelAnswer ? <span className="text-xs text-muted">Model answer unlocks after you {deferEvaluation ? 'finish the session' : 'submit'}.</span> : null}
      </div>
      {showModel && revealedAnswer && <div className="rounded-md bg-surface-2 p-3"><Markdown>{revealedAnswer}</Markdown></div>}
    </div>
  );
}
