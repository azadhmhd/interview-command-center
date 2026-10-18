/**
 * Output contracts for every AI task. The SAME schemas validate LLM responses and imported agent outputs, and are
 * exported as JSON Schema into the agent skill pack (scripts/gen-schemas.ts). No Nest imports here.
 */
import { z } from 'zod';

const str = (max = 20000) => z.string().max(max);
const list = (max = 30, len = 500) => z.array(z.string().max(len)).max(max).default([]);

export const lessonQuestionOut = z.object({
  prompt: str(4000).min(3),
  modelAnswer: str(20000).optional(),
  followUps: list(10, 1000),
  source: z.enum(['AI_PREDICTED', 'PRACTICE', 'PUBLIC_REPORT']).default('PRACTICE')
    .describe('AI_PREDICTED = you predict it may be asked; PRACTICE = exercise; PUBLIC_REPORT = only with a cited public source'),
});

export const lessonOut = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,60}$/).describe('stable slug; reuse existing keys to update a lesson'),
  kind: z.enum(['concept', 'coding', 'system_design', 'behavioral', 'flashcards', 'mock', 'revision', 'recruiter', 'take_home']),
  title: str(200).min(3),
  objectives: list(8, 300),
  estimatedMinutes: z.number().int().min(5).max(480),
  explanation: str(30000).min(20).describe('Markdown. Tailored to the candidate\'s background.'),
  examples: str(30000).optional(),
  questions: z.array(lessonQuestionOut).max(25).default([]),
  evaluationCriteria: list(10, 300),
  commonMistakes: list(10, 300),
  scheduledDay: z.number().int().min(0).max(30).optional(),
});

export const OUTPUT_SCHEMAS = {
  course_generation: z.object({
    expectations: str(4000),
    competencies: list(15, 200),
    topicChecklist: z.array(z.object({ title: str(200), priority: z.enum(['high', 'medium', 'low']), reason: str(500) })).max(25).default([]),
    lessons: z.array(lessonOut).min(1).max(20),
    questionsToAsk: list(10, 300),
    risks: list(10, 500),
    finalNotes: str(20000).optional(),
    assumptions: list(10, 500).describe('Uncertain claims or predictions you made, stated plainly'),
  }),
  lesson_regeneration: z.object({ lesson: lessonOut }),
  answer_evaluation: z.object({
    score: z.number().min(0).max(10),
    rubric: z.object({ correctness: z.number().min(0).max(10), completeness: z.number().min(0).max(10), depth: z.number().min(0).max(10), clarity: z.number().min(0).max(10) }),
    missingConcepts: list(20, 300),
    incorrectClaims: list(20, 500),
    improvements: list(20, 500),
    strongAnswer: str(20000).describe('An example of a strong answer'),
    followUps: list(10, 500),
    confidence: z.enum(['low', 'medium', 'high']).describe('Your confidence in this evaluation'),
  }),
  answer_improvement: z.object({
    improvedAnswer: str(20000).min(10),
    conceptsCorrect: list(20, 200),
    conceptsPartial: list(20, 200),
    conceptsMissed: list(20, 200),
    mistakes: str(5000).optional(),
    communicationNotes: str(5000).optional(),
  }),
  resume_extraction: z.object({
    name: str(200).optional(),
    headline: str(300).optional(),
    yearsExperience: z.number().min(0).max(60).optional(),
    roles: z.array(z.object({ company: str(200), title: str(200), start: str(40).optional(), end: str(40).optional(), highlights: list(15, 500) })).max(30).default([]),
    skills: list(80, 80),
    education: list(10, 300),
    projects: z.array(z.object({ name: str(200), summary: str(1000) })).max(20).default([]),
    certifications: list(20, 200),
  }),
  question_extraction: z.object({
    questions: z.array(z.object({ prompt: str(4000).min(3), answer: str(20000).optional(), followUps: str(4000).optional(), tags: list(10, 60) })).max(100),
  }),
  revision_notes: z.object({
    finalNotes: str(30000).min(20).describe('Markdown, concise, interview-day ready'),
    keyPoints: list(20, 500),
    questionsToAsk: list(10, 300),
    risks: list(10, 500),
  }),
  gap_analysis: z.object({
    summary: str(5000),
    weakTopics: list(20, 120),
    recurringMistakes: list(15, 500),
    recommendations: list(15, 500),
  }),
  mock_generation: z.object({
    questions: z.array(z.object({ prompt: str(4000).min(3), modelAnswer: str(20000).optional(), followUps: list(10, 1000) })).min(1).max(20),
  }),
  company_research: z.object({
    sources: z.array(z.object({ url: z.string().url().max(2000), title: str(300), summary: str(2000), retrievedAt: z.string().max(40) })).max(30).default([]),
    patterns: z.array(z.object({ pattern: str(1000), evidenceUrls: z.array(z.string().url()).max(10).default([]) })).max(20).default([]),
    reportedQuestions: z.array(z.object({ prompt: str(2000), sourceUrl: z.string().url().max(2000) })).max(40).default([])
      .describe('Only questions that appear in a cited public source'),
    limitations: str(3000).describe('What you could not access or verify'),
  }),
  job_match: z.object({
    score: z.number().min(0).max(100).describe('Semantic fit 0-100 based only on the job text and the candidate facts'),
    strengths: list(10, 300),
    gaps: list(10, 300),
    mandatoryMissing: list(10, 300).describe('Required qualifications the candidate facts do not show'),
    explanation: str(3000),
  }),
  apply_answers: z.object({
    coverNote: str(6000).optional().describe('Short cover note using only facts from the context'),
    answers: z.array(z.object({ key: str(200), answer: str(4000) })).max(40).default([])
      .describe('Answers ONLY for the requested open-ended question keys; never for factual or sensitive questions'),
  }),
  job_application: z.object({
    status: z.enum(['SUBMITTED', 'BLOCKED', 'NEEDS_ATTENTION', 'FAILED']),
    confirmationUrl: z.string().url().max(2000).optional(),
    confirmationText: str(4000).optional().describe('Text of the confirmation page/message seen after submitting'),
    filledFields: z.array(z.object({ label: str(500), value: str(4000).optional(), source: str(40).optional() })).max(200).default([]),
    missingFields: list(100, 500),
    notes: str(3000).optional(),
  }),
} as const;

export type TaskType = keyof typeof OUTPUT_SCHEMAS;
export const TASK_TYPES = Object.keys(OUTPUT_SCHEMAS) as TaskType[];

/** Which skill in the agent skill pack handles each task type. */
export const TASK_SKILLS: Record<TaskType, string> = {
  course_generation: 'icc-prepare-interview',
  lesson_regeneration: 'icc-prepare-interview',
  answer_evaluation: 'icc-evaluate-answer',
  answer_improvement: 'icc-model-answers',
  resume_extraction: 'icc-import-validate',
  question_extraction: 'icc-import-validate',
  revision_notes: 'icc-final-revision',
  gap_analysis: 'icc-evaluate-answer',
  mock_generation: 'icc-model-answers',
  company_research: 'icc-research-patterns',
  job_match: 'icc-evaluate-answer',
  apply_answers: 'icc-model-answers',
  job_application: 'icc-auto-apply',
};
