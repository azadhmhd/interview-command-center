'use client';
import { useEffect, useState } from 'react';
import { api, refresh, useApi } from '@/lib/api';
import type { Round } from '@/lib/types';
import { fmtDate, label } from '@/lib/utils';
import { Button, Dialog, Field, Input, Select, Textarea, useAction } from './ui';

const DRAFT = 'icc.capture.draft';

/** Record a question in seconds right after an interview. Draft autosaves to this browser. */
export function QuickCapture({ open, onClose, roundId: fixedRound }: { open: boolean; onClose: () => void; roundId?: string }) {
  const { data: rounds } = useApi<Round[]>(open && !fixedRound ? '/rounds' : null);
  const [roundId, setRoundId] = useState(fixedRound ?? '');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [mistakes, setMistakes] = useState('');
  const [count, setCount] = useState(0);
  const { busy, run } = useAction();

  useEffect(() => {
    if (!open) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || '{}');
      if (d.prompt || d.answer) { setPrompt(d.prompt ?? ''); setAnswer(d.answer ?? ''); setMistakes(d.mistakes ?? ''); }
      if (!fixedRound && d.roundId) setRoundId(d.roundId);
    } catch { /* ignore */ }
  }, [open, fixedRound]);
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(DRAFT, JSON.stringify({ roundId, prompt, answer, mistakes })); } catch { /* ignore */ }
  }, [open, roundId, prompt, answer, mistakes]);

  // Most recent / upcoming rounds first
  const sorted = [...(rounds ?? [])].sort((a, b) => Math.abs(new Date(a.scheduledAt ?? 0).getTime() - Date.now()) - Math.abs(new Date(b.scheduledAt ?? 0).getTime() - Date.now()));
  useEffect(() => { if (!roundId && sorted[0]) setRoundId(sorted[0].id); }, [sorted, roundId]);

  const save = async (again: boolean) => {
    const r = await run('save', () => api(`/rounds/${roundId}/questions`, { body: { prompt, originalAnswer: answer || undefined, mistakes: mistakes || undefined, source: 'REPORTED' } }), 'Question saved');
    if (!r) return;
    setPrompt(''); setAnswer(''); setMistakes(''); setCount((c) => c + 1);
    try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
    refresh('/rounds', '/questions', '/applications', '/dashboard');
    if (!again) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Quick capture — question actually asked">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(true); }}>
        {!fixedRound && (
          <Field label="Interview round" htmlFor="qc-round">
            <Select id="qc-round" value={roundId} onChange={(e) => setRoundId(e.target.value)} required>
              {!sorted.length && <option value="">Add an interview round to an application first</option>}
              {sorted.map((r) => <option key={r.id} value={r.id}>{r.application?.companyName} · {r.title || label(r.type)} · {fmtDate(r.scheduledAt)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Question (required)" htmlFor="qc-prompt"><Textarea id="qc-prompt" required autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What were you asked?" className="min-h-16" /></Field>
        <Field label="Your original answer (preserved as you write it)" htmlFor="qc-answer"><Textarea id="qc-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What did you actually say? Markdown and ``` code blocks supported." /></Field>
        <Field label="Mistakes / what went wrong" htmlFor="qc-mistakes"><Input id="qc-mistakes" value={mistakes} onChange={(e) => setMistakes(e.target.value)} /></Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted">{count ? `${count} saved this session · ` : ''}Draft autosaves</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!roundId || !prompt.trim()} loading={busy === 'save'} onClick={() => save(false)}>Save & close</Button>
            <Button type="submit" disabled={!roundId || !prompt.trim()} loading={busy === 'save'}>Save & add another</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
