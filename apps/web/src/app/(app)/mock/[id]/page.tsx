'use client';
import { Timer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AttemptResult, PracticeBox } from '@/components/practice-box';
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Progress, SOURCE_LABEL, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Attempt, LessonQuestion } from '@/lib/types';

interface Session { id: string; title: string; status: string; learningMode: boolean; questions: LessonQuestion[]; attempts: Attempt[]; averageScore: number | null }

export default function MockSession() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error, isLoading, mutate } = useApi<Session>(`/practice/sessions/${id}`, { refreshInterval: 5000 });
  const [i, setI] = useState(0);
  const [secs, setSecs] = useState(0);
  const { busy, run } = useAction();
  useEffect(() => { setSecs(0); const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, [i]);
  if (isLoading) return <Loading />;
  if (error || !s) return <ErrorBox error={error ?? new Error('Not found')} />;
  const q = s.questions[i];
  const answered = s.attempts.length;

  if (s.status === 'completed') {
    return (
      <div className="space-y-4">
        <PageHeader back={{ href: '/mock', label: 'Mock interviews' }} title={`${s.title} — summary`} description={s.averageScore !== null ? `Average score ${s.averageScore}/10 across evaluated answers` : 'No evaluated answers yet'} />
        {s.questions.map((qq, idx) => {
          const att = s.attempts.filter((a) => a.questionIndex === idx).at(-1); // latest attempt is the one evaluated
          return (
            <Card key={idx} className="space-y-2 p-4">
              <p className="text-sm font-medium">{idx + 1}. {qq.prompt} <Badge>{SOURCE_LABEL[qq.source] ?? qq.source}</Badge></p>
              {att ? <AttemptResult attemptId={att.id} /> : <p className="text-xs text-muted">Skipped</p>}
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/mock', label: 'Mock interviews' }} title={s.title}
        description={<span className="flex items-center gap-2"><Timer className="h-3.5 w-3.5" />{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} on this question · {answered} answered</span>}
        actions={<Button variant="outline" loading={busy === 'done'} onClick={async () => { await run('done', () => api(`/practice/sessions/${id}/complete`, { method: 'POST' })); mutate(); }}>Finish session</Button>} />
      <Progress value={((i + 1) / s.questions.length) * 100} />
      <Card className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2"><p className="text-base font-medium">Q{i + 1}. {q.prompt}</p><Badge tone={q.source === 'REPORTED' ? 'accent' : 'neutral'}>{SOURCE_LABEL[q.source] ?? q.source}</Badge></div>
        <p className="text-xs text-muted">Answer aloud first as you would in the interview, then type the key points.</p>
        <PracticeBox key={i} target={{ sessionId: s.id, questionIndex: i }} prompt={q.prompt} hasModelAnswer={q.hasModelAnswer} revealedAnswer={q.modelAnswer} onAttempt={() => mutate()} deferEvaluation />
      </Card>
      <div className="flex justify-between">
        <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous</Button>
        {i < s.questions.length - 1 ? <Button variant="outline" onClick={() => setI(i + 1)}>Next question →</Button> : <Button onClick={async () => { await run('done', () => api(`/practice/sessions/${id}/complete`, { method: 'POST' })); mutate(); }}>Finish & see summary</Button>}
      </div>
    </div>
  );
}
