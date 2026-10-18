import { CATALOG, CatalogTopic, expectationsFor } from './catalog';

export type Mode = 'QUICK' | 'STANDARD' | 'DEEP';

export interface PastQuestion {
  id: string;
  prompt: string;
  source: string;
  missed: string[];
  mistakes?: string | null;
  where?: string;
}

export interface PlanInput {
  roundType: string;
  mode: Mode;
  now: Date;
  interviewAt?: Date | null;
  dailyStudyHours: number;
  studyHoursAvailable?: number | null;
  jobDescription?: string | null;
  jobTitle?: string;
  company?: string;
  weakTopics: string[];
  pastQuestions: PastQuestion[];
}

export interface LessonQuestion {
  prompt: string;
  modelAnswer?: string;
  followUps?: string[];
  source: 'REPORTED' | 'PUBLIC_REPORT' | 'AI_PREDICTED' | 'PRACTICE';
  occurrenceId?: string;
}

export interface LessonDraft {
  key: string;
  order: number;
  kind: string;
  title: string;
  objectives: string[];
  estimatedMinutes: number;
  explanation: string;
  examples?: string;
  questions: LessonQuestion[];
  evaluationCriteria: string[];
  commonMistakes: string[];
  linkedOccurrenceIds: string[];
  scheduledDay: number;
}

export interface ChecklistItem {
  key: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface PlanOverview {
  expectations: string;
  competencies: string[];
  topicChecklist: ChecklistItem[];
  schedule: { day: number; date: string; label: string; lessonKeys: string[]; minutes: number }[];
  studyDays: number;
  budgetMinutes: number;
  risks: string[];
  questionsToAsk: string[];
  finalNotes?: string;
  disclaimer: string;
}

const MODE_DAYS: Record<Mode, number> = { QUICK: 1, STANDARD: 3, DEEP: 7 };
const MODE_SCALE: Record<Mode, number> = { QUICK: 0.5, STANDARD: 1, DEEP: 1.5 };
const DAY = 864e5;
const DOMINANT_KIND: Record<string, string> = {
  system_design: 'system_design', coding: 'coding', behavioral: 'behavioral', recruiter_screen: 'recruiter', take_home: 'take_home',
};

const lc = (s: string) => s.toLowerCase();

export function weakMatches(topic: CatalogTopic, weak: string[]): string[] {
  return weak.filter((w) => {
    const x = lc(w).trim();
    if (x.length < 3) return false;
    return topic.keywords.some((k) => x.includes(k) || (k.length >= 4 && k.includes(x))) || lc(topic.title).includes(x);
  });
}

export function jdMatches(topic: CatalogTopic, jd: string): string[] {
  const text = lc(jd);
  return topic.keywords.filter((k) => new RegExp(`(^|[^a-z])${k.replace(/[.+]/g, '\\$&')}`, 'i').test(text));
}

/** Deterministic, AI-free preparation plan. Pure function: same input → same plan. */
export function buildPlan(input: PlanInput): { overview: PlanOverview; lessons: LessonDraft[] } {
  const jd = input.jobDescription ?? '';
  const scale = MODE_SCALE[input.mode];
  const hoursUntil = input.interviewAt ? (input.interviewAt.getTime() - input.now.getTime()) / 36e5 : undefined;
  const studyDays = hoursUntil === undefined ? MODE_DAYS[input.mode] : Math.max(1, Math.min(MODE_DAYS[input.mode], Math.ceil(hoursUntil / 24)));
  let budgetMinutes = Math.round((input.studyHoursAvailable ?? studyDays * input.dailyStudyHours) * 60);
  if (input.mode === 'QUICK') budgetMinutes = Math.min(budgetMinutes, 180);
  if (hoursUntil !== undefined && hoursUntil > 0) budgetMinutes = Math.min(budgetMinutes, Math.round(hoursUntil * 60 * 0.5));
  budgetMinutes = Math.max(budgetMinutes, 30);

  const technical = !['recruiter_screen'].includes(input.roundType);
  const scored = CATALOG.map((t) => {
    const primary = t.roundTypes.includes(input.roundType);
    const jdHits = jd ? jdMatches(t, jd) : [];
    const weakHits = weakMatches(t, input.weakTopics);
    const eligible = primary || (technical && t.kind !== 'recruiter' && (jdHits.length > 0 || weakHits.length > 0));
    const score = (primary ? 10 : 0) + jdHits.length * 3 + weakHits.length * 6;
    const reasons = [
      ...(primary ? [`Core topic for ${input.roundType.replace(/_/g, ' ')} rounds`] : []),
      ...(jdHits.length ? [`Job description mentions: ${jdHits.slice(0, 4).join(', ')}`] : []),
      ...(weakHits.length ? [`Previously weak: ${weakHits.slice(0, 3).join(', ')}`] : []),
    ];
    return { t, eligible, score, reasons, weakHits };
  }).filter((x) => x.eligible).sort((a, b) => b.score - a.score || a.t.key.localeCompare(b.t.key));

  const reported = input.pastQuestions.filter((q) => q.source === 'REPORTED');
  const fixed: LessonDraft[] = [];
  if (reported.length) {
    const ranked = [...reported].sort((a, b) => b.missed.length - a.missed.length).slice(0, 8);
    const missed = [...new Set(reported.flatMap((q) => q.missed))];
    fixed.push({
      key: 'personal-review', order: 0, kind: 'revision', title: 'Your past interview questions & mistakes',
      objectives: ['Re-answer questions you were actually asked', 'Close the gaps you identified after earlier rounds'],
      estimatedMinutes: Math.round(30 * scale + ranked.length * 5),
      explanation: [
        'These are questions you reported from real interviews. Answer each again without looking at your old answer, then compare.',
        missed.length ? `Concepts you previously missed or partially answered: ${missed.slice(0, 12).join(', ')}.` : '',
        ...ranked.filter((q) => q.mistakes).slice(0, 5).map((q) => `- ${q.where ? `${q.where}: ` : ''}${q.mistakes}`),
      ].filter(Boolean).join('\n\n'),
      questions: ranked.map((q) => ({ prompt: q.prompt, source: 'REPORTED' as const, occurrenceId: q.id })),
      evaluationCriteria: ['Addresses the previously missed concepts', 'Clearer structure than the original answer'],
      commonMistakes: ['Repeating the original answer verbatim'], linkedOccurrenceIds: ranked.map((q) => q.id), scheduledDay: 0,
    });
  }
  const mockMinutes = Math.round(45 * scale);
  const fixedMinutes = fixed.reduce((s, l) => s + l.estimatedMinutes, 0) + mockMinutes + 20;
  let remaining = budgetMinutes - fixedMinutes;
  const minTopics = input.mode === 'QUICK' ? 1 : 2;
  // The round's anchor topic (e.g. the system design framework) is always included, whatever the budget.
  const anchorKind = DOMINANT_KIND[input.roundType];
  const anchorTopic = CATALOG.find((t) => t.roundTypes.includes(input.roundType) && t.kind === anchorKind); // first = foundational
  const anchor = scored.find((x) => x.t === anchorTopic);
  const chosen: typeof scored = anchor ? [anchor] : [];
  if (anchor) remaining -= Math.round(anchor.t.minutes * scale);
  for (const s of scored) {
    if (s === anchor) continue;
    const m = Math.round(s.t.minutes * scale);
    if (chosen.length < minTopics || m <= remaining) {
      chosen.push(s);
      remaining -= m;
    }
  }

  const topicLessons: LessonDraft[] = chosen.map((s, i) => ({
    key: s.t.key, order: fixed.length + i, kind: s.t.kind, title: s.t.title, objectives: s.t.objectives,
    estimatedMinutes: Math.round(s.t.minutes * scale), explanation: s.t.explanation,
    questions: s.t.questions.map((prompt) => ({ prompt, source: 'PRACTICE' as const })),
    evaluationCriteria: s.t.criteria, commonMistakes: s.t.mistakes, linkedOccurrenceIds: [], scheduledDay: 0,
  }));

  const mockPool = [...reported.map((q) => ({ prompt: q.prompt, source: 'REPORTED' as const, occurrenceId: q.id })), ...topicLessons.flatMap((l) => l.questions)];
  const mock: LessonDraft = {
    key: 'mock-interview', order: fixed.length + topicLessons.length, kind: 'mock', title: 'Targeted mock interview',
    objectives: ['Answer under time pressure without notes', 'Get evaluated and retry weak answers'],
    estimatedMinutes: mockMinutes,
    explanation: 'Start a mock session from this lesson. Answer each question as you would in the interview (aloud first, then type). Model answers stay hidden until you submit.',
    questions: mockPool.slice(0, input.mode === 'QUICK' ? 4 : 6), evaluationCriteria: ['Structure', 'Correctness', 'Concise delivery'],
    commonMistakes: ['Reading notes', 'Skipping the self-review'], linkedOccurrenceIds: [], scheduledDay: 0,
  };
  const exp = expectationsFor(input.roundType);
  const final: LessonDraft = {
    key: 'final-revision', order: mock.order + 1, kind: 'revision', title: 'Final revision & interview-day checklist',
    objectives: ['Review key points and your best stories', 'Prepare logistics and questions to ask'],
    estimatedMinutes: 20,
    explanation: [
      `**Round:** ${input.roundType.replace(/_/g, ' ')}${input.company ? ` at ${input.company}` : ''}.`,
      `**What to expect:** ${exp.expectations}`,
      `**Key topics:** ${topicLessons.map((l) => l.title).join('; ')}.`,
      '**Checklist:** test audio/video and meeting link, have water and a notepad, keep your CV and the job description open, prepare a 90-second introduction.',
      `**Questions to ask:**\n${exp.questionsToAsk.map((q) => `- ${q}`).join('\n')}`,
    ].join('\n\n'),
    questions: [], evaluationCriteria: [], commonMistakes: ['Cramming new topics on the interview day'], linkedOccurrenceIds: [], scheduledDay: 0,
  };

  // Spread study lessons over the available days; mock on the second-last day, revision on the last.
  const lessons = [...fixed, ...topicLessons, mock, final];
  const perDay = Math.max(30, Math.round(budgetMinutes / studyDays));
  let day = 0;
  let used = 0;
  for (const l of [...fixed, ...topicLessons]) {
    if (used + l.estimatedMinutes > perDay && used > 0 && day < Math.max(0, studyDays - 2)) {
      day += 1;
      used = 0;
    }
    l.scheduledDay = day;
    used += l.estimatedMinutes;
  }
  mock.scheduledDay = Math.max(day, studyDays - 2, 0);
  final.scheduledDay = studyDays - 1;

  const schedule = Array.from({ length: studyDays }, (_, d) => {
    const ls = lessons.filter((l) => l.scheduledDay === d);
    return {
      day: d, date: new Date(input.now.getTime() + d * DAY).toISOString().slice(0, 10),
      label: input.interviewAt ? `${studyDays - d} day(s) before the interview` : `Day ${d + 1}`,
      lessonKeys: ls.map((l) => l.key), minutes: ls.reduce((s, l) => s + l.estimatedMinutes, 0),
    };
  });

  const coveredWeak = new Set(chosen.flatMap((c) => c.weakHits));
  const uncovered = input.weakTopics.filter((w) => !coveredWeak.has(w));
  const totalMinutes = lessons.reduce((s, l) => s + l.estimatedMinutes, 0);
  const risks = [
    ...(hoursUntil !== undefined && hoursUntil < 24 ? ['Interview is less than 24 hours away — plan compressed to essentials.'] : []),
    ...(totalMinutes > budgetMinutes ? [`Plan needs ~${Math.round(totalMinutes / 60)}h but only ~${Math.round(budgetMinutes / 60)}h are available. Prioritise high-priority topics.`] : []),
    ...(!jd.trim() ? ['No job description recorded — topics are based on round type only. Add the JD for a sharper plan.'] : []),
    ...(uncovered.length ? [`Weak areas not covered by catalog lessons: ${uncovered.slice(0, 8).join(', ')}. Generate AI lessons or study them separately.`] : []),
  ];

  const prio = (score: number): ChecklistItem['priority'] => (score >= 16 ? 'high' : score >= 10 ? 'medium' : 'low');
  return {
    lessons,
    overview: {
      expectations: exp.expectations, competencies: exp.competencies,
      topicChecklist: [
        ...fixed.map((l) => ({ key: l.key, title: l.title, priority: 'high' as const, reasons: ['Questions you were actually asked before'] })),
        ...chosen.map((c) => ({ key: c.t.key, title: c.t.title, priority: prio(c.score), reasons: c.reasons })),
      ],
      schedule, studyDays, budgetMinutes, risks, questionsToAsk: exp.questionsToAsk,
      disclaimer: 'Topics are predicted from the round type, job description and your history. They are not known questions from this company.',
    },
  };
}
