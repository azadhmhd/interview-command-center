'use client';
import { ChevronDown, ChevronRight, Lock, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, refresh } from '@/lib/api';
import type { Occurrence } from '@/lib/types';
import { fmtDate } from '@/lib/utils';
import { Badge, Button, Field, Input, Markdown, Select, SOURCE_LABEL, StateBadge, Textarea, useAction } from './ui';

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** One journal entry. The original answer locks once recorded; improvements live in separate fields. */
export function QuestionEditor({ q, onChange, defaultOpen }: { q: Occurrence; onChange: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [f, setF] = useState({
    originalAnswer: q.originalAnswer ?? '', followUps: q.followUps ?? '', problemStatement: q.problemStatement ?? '', codeSnippet: q.codeSnippet ?? '',
    codeLanguage: q.codeLanguage ?? '', testCases: q.testCases ?? '', confidence: q.confidence ? String(q.confidence) : '', conceptsCorrect: q.conceptsCorrect.join(', '),
    conceptsPartial: q.conceptsPartial.join(', '), conceptsMissed: q.conceptsMissed.join(', '), mistakes: q.mistakes ?? '', communicationNotes: q.communicationNotes ?? '',
    improvedAnswer: q.improvedAnswer ?? '', approvedAnswer: q.approvedAnswer ?? '', tags: q.tags.join(', '), difficulty: q.difficulty ?? '',
  });
  const { busy, run } = useAction();
  const locked = !!q.originalAnswer;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const body = {
      ...(!locked && f.originalAnswer && { originalAnswer: f.originalAnswer }),
      followUps: f.followUps || null, problemStatement: f.problemStatement || null, codeSnippet: f.codeSnippet || null, codeLanguage: f.codeLanguage || null,
      testCases: f.testCases || null, confidence: f.confidence ? Number(f.confidence) : null, conceptsCorrect: csv(f.conceptsCorrect), conceptsPartial: csv(f.conceptsPartial),
      conceptsMissed: csv(f.conceptsMissed), mistakes: f.mistakes || null, communicationNotes: f.communicationNotes || null, improvedAnswer: f.improvedAnswer || null,
      approvedAnswer: f.approvedAnswer || null, tags: csv(f.tags), difficulty: f.difficulty || null,
    };
    if (await run('save', () => api(`/occurrences/${q.id}`, { method: 'PATCH', body }), 'Saved')) { onChange(); refresh('/questions', '/dashboard'); }
  };

  return (
    <li className="px-4 py-3">
      <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
        <span className="flex-1 text-sm font-medium">{q.prompt}</span>
        <StateBadge value={q.source} />
        {q.conceptsMissed.length > 0 && <Badge tone="warning">{q.conceptsMissed.length} missed</Badge>}
        {q.approvedAnswer && <Badge tone="success">approved</Badge>}
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-6">
          {q.source !== 'REPORTED' && <p className="text-xs text-muted">Label: <strong>{SOURCE_LABEL[q.source]}</strong>{q.sourceUrl && <> · <a className="text-accent underline" href={q.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>} — not a question you were actually asked.</p>}
          <Field label={locked ? 'Your original answer (preserved, read-only)' : 'Your original answer — locks once saved'}>
            {locked ? <div className="rounded-md border border-border bg-surface-2 p-3"><p className="mb-1 flex items-center gap-1 text-[11px] text-muted"><Lock className="h-3 w-3" />Recorded {fmtDate(q.askedAt ?? q.createdAt, true)}</p><Markdown>{q.originalAnswer}</Markdown></div>
              : <Textarea value={f.originalAnswer} onChange={set('originalAnswer')} placeholder="What you actually said in the interview" />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Concepts answered correctly"><Input value={f.conceptsCorrect} onChange={set('conceptsCorrect')} placeholder="comma separated" /></Field>
            <Field label="Partially answered"><Input value={f.conceptsPartial} onChange={set('conceptsPartial')} /></Field>
            <Field label="Missed"><Input value={f.conceptsMissed} onChange={set('conceptsMissed')} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Technical mistakes / misconceptions"><Textarea value={f.mistakes} onChange={set('mistakes')} className="min-h-16" /></Field>
            <Field label="Communication notes"><Textarea value={f.communicationNotes} onChange={set('communicationNotes')} className="min-h-16" /></Field>
          </div>
          <Field label="Follow-up questions asked"><Textarea value={f.followUps} onChange={set('followUps')} className="min-h-14" /></Field>
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted">Coding details (problem, code, tests)</summary>
            <div className="mt-3 space-y-3">
              <Field label="Problem statement"><Textarea value={f.problemStatement} onChange={set('problemStatement')} /></Field>
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <Field label="Code snippet"><Textarea value={f.codeSnippet} onChange={set('codeSnippet')} className="min-h-28 font-mono text-xs" spellCheck={false} /></Field>
                <Field label="Language"><Input value={f.codeLanguage} onChange={set('codeLanguage')} placeholder="python" /></Field>
              </div>
              <Field label="Test cases"><Textarea value={f.testCases} onChange={set('testCases')} className="font-mono text-xs" /></Field>
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Confidence (1-5)"><Select value={f.confidence} onChange={set('confidence')}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <Field label="Difficulty"><Select value={f.difficulty} onChange={set('difficulty')}><option value="">—</option><option>easy</option><option>medium</option><option>hard</option></Select></Field>
            <Field label="Tags"><Input value={f.tags} onChange={set('tags')} placeholder="postgres, caching" /></Field>
          </div>
          <Field label={`Proposed improved answer${q.improvedAnswerBy ? ` (by ${q.improvedAnswerBy})` : ''}`}><Textarea value={f.improvedAnswer} onChange={set('improvedAnswer')} className="min-h-24" /></Field>
          <Field label="Your reviewed & approved final answer" hint="Becomes the best answer in your knowledge base."><Textarea value={f.approvedAnswer} onChange={set('approvedAnswer')} className="min-h-24" /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={busy === 'save'}>Save</Button>
            <Button variant="outline" loading={busy === 'improve'} onClick={async () => { const t = await run('improve', () => api<{ state: string }>(`/occurrences/${q.id}/improve`, { method: 'POST' })); if (t) { onChange(); refresh('/tasks'); } }}><Sparkles className="h-3.5 w-3.5" />Propose improved answer</Button>
            {f.improvedAnswer && !f.approvedAnswer && <Button variant="ghost" onClick={() => setF({ ...f, approvedAnswer: f.improvedAnswer })}>Copy to approved</Button>}
            {q.canonicalQuestionId && <Link className="text-xs text-accent" href={`/questions/${q.canonicalQuestionId}`}>History & practice →</Link>}
            <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={async () => { if (confirm('Delete this question?')) { await run('del', () => api(`/occurrences/${q.id}`, { method: 'DELETE' })); onChange(); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </li>
  );
}
