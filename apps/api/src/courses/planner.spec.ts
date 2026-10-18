import { buildPlan } from './planner';

const now = new Date('2026-10-18T09:00:00Z');
const base = {
  mode: 'STANDARD' as const, now, dailyStudyHours: 2, weakTopics: [] as string[], pastQuestions: [],
};

describe('deterministic planner', () => {
  it('builds a system design plan reflecting the JD, deadline and weaknesses', () => {
    const plan = buildPlan({
      ...base, roundType: 'system_design', interviewAt: new Date('2026-10-21T09:00:00Z'),
      jobDescription: 'We use Kafka, PostgreSQL and Redis to build RAG pipelines.',
      weakTopics: ['kafka partitions', 'cache invalidation'],
      pastQuestions: [{ id: 'q1', prompt: 'Design a URL shortener', source: 'REPORTED', missed: ['hot keys'], mistakes: 'Forgot capacity estimate' }],
    });
    const keys = plan.lessons.map((l) => l.key);
    expect(keys[0]).toBe('personal-review'); // real past questions first
    expect(keys).toContain('sd-framework'); // round type
    expect(keys).toContain('queues-async'); // JD + weak "kafka"
    expect(keys.slice(-2)).toEqual(['mock-interview', 'final-revision']);
    expect(plan.overview.studyDays).toBe(3); // deadline-aware
    expect(plan.overview.schedule).toHaveLength(3);
    const q = plan.overview.topicChecklist.find((c) => c.key === 'queues-async')!;
    expect(q.reasons.join(' ')).toMatch(/kafka/i);
    expect(q.reasons.join(' ')).toMatch(/Previously weak/);
    expect(plan.lessons[0].questions[0]).toMatchObject({ source: 'REPORTED', occurrenceId: 'q1' });
    expect(plan.lessons.find((l) => l.key === 'final-revision')!.scheduledDay).toBe(2);
  });

  it('compresses for short notice and never schedules in the past', () => {
    const plan = buildPlan({ ...base, roundType: 'coding', interviewAt: new Date('2026-10-18T20:00:00Z') });
    expect(plan.overview.studyDays).toBe(1);
    expect(plan.overview.risks.join(' ')).toMatch(/less than 24 hours/);
    expect(plan.overview.schedule[0].date).toBe('2026-10-18');
    expect(plan.lessons.every((l) => l.scheduledDay === 0)).toBe(true);
  });

  it('labels catalog questions as practice, not predictions', () => {
    const plan = buildPlan({ ...base, roundType: 'behavioral' });
    const qs = plan.lessons.flatMap((l) => l.questions);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.source === 'PRACTICE')).toBe(true);
    expect(plan.overview.disclaimer).toMatch(/not known questions/);
  });

  it('is deterministic', () => {
    const i = { ...base, roundType: 'backend', jobDescription: 'Django, Postgres' };
    expect(JSON.stringify(buildPlan(i))).toBe(JSON.stringify(buildPlan(i)));
  });
});
