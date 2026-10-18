'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, Markdown, PageHeader, Textarea, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Lesson } from '@/lib/types';

export default function SharedCourse() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useApi<{ permission: string; course: { title: string; mode: string; overview: { expectations?: string }; lessons: Lesson[] } }>(`/shared/courses/${id}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const { busy, run } = useAction();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Not found')} />;
  const { course, permission } = data;
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/shared', label: 'Shared with me' }} title={course.title} description={<span className="flex gap-2"><Badge>{permission.toLowerCase()} access</Badge><span>Study template — the owner&apos;s interviews and answers are not included.</span></span>} />
      {course.overview.expectations && <Card className="p-4 text-sm">{course.overview.expectations}</Card>}
      {course.lessons.map((l) => (
        <Card key={l.id}>
          <CardHeader title={l.title} description={`${l.kind.replace('_', ' ')} · ${l.estimatedMinutes} min`} action={permission === 'EDIT' && editing !== l.id ? <Button size="sm" variant="outline" onClick={() => { setEditing(l.id); setText(l.explanation); }}>Edit</Button> : undefined} />
          <div className="p-4">
            {editing === l.id ? (
              <div className="space-y-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48" /><div className="flex gap-2"><Button size="sm" loading={busy === l.id} onClick={async () => { if (await run(l.id, () => api(`/shared/courses/${id}/lessons/${l.id}`, { method: 'PATCH', body: { explanation: text } }), 'Lesson updated')) { setEditing(null); mutate(); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div></div>
            ) : <Markdown>{l.explanation}</Markdown>}
            {l.questions.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm">{l.questions.map((q, i) => <li key={i}>{q.prompt}</li>)}</ul>}
          </div>
        </Card>
      ))}
    </div>
  );
}
