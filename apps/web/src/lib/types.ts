export interface Me {
  user: { id: string; email: string; name: string };
  workspaceId: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  workspaces: { id: string; name: string; personal: boolean; role: string }[];
}
export interface WorkspaceSettings {
  statuses: string[];
  roundTypes: { key: string; label: string }[];
  timezone: string;
  quietHours: { start: number; end: number };
  dailyStudyHours: number;
  milestoneDays: number[];
  followUpDays: number;
  routing: Record<string, 'llm' | 'agent' | 'auto'>;
  fallbackToAgent: boolean;
  reviewAiOutput: boolean;
  learningMode: boolean;
}
export interface Round {
  id: string; applicationId: string; sequence: number; type: string; title?: string | null; scheduledAt?: string | null; durationMinutes?: number | null;
  interviewer?: string | null; format?: string | null; meetingLink?: string | null; status: string; outcome: string; feedback?: string | null;
  nextSteps?: string | null; notes?: string | null; confidence?: number | null; studyHoursAvailable?: number | null; prepIntensity: string;
  application?: { id: string; companyName: string; jobTitle: string; status: string };
  _count?: { occurrences: number; courses?: number };
}
export interface Application {
  id: string; companyName: string; companyWebsite?: string | null; location?: string | null; companyNotes?: string | null; jobTitle: string;
  seniority?: string | null; jobDescription?: string | null; jobUrl?: string | null; source?: string | null; appliedAt?: string | null;
  resumeId?: string | null; coverLetter?: string | null; salaryExpectation?: number | null; salaryCurrency: string; benefits?: string | null;
  noticePeriodDays?: number | null; status: string; priority: 'LOW' | 'MEDIUM' | 'HIGH'; nextAction?: string | null; nextActionAt?: string | null;
  offerDetails?: string | null; rejectionReason?: string | null; withdrawalReason?: string | null; createdAt: string; updatedAt: string;
  rounds: Round[]; nextRound?: Round | null; _count?: { occurrences: number; courses: number };
}
export interface Occurrence {
  id: string; prompt: string; source: string; originalAnswer?: string | null; followUps?: string | null; problemStatement?: string | null;
  codeSnippet?: string | null; codeLanguage?: string | null; testCases?: string | null; confidence?: number | null; conceptsCorrect: string[];
  conceptsPartial: string[]; conceptsMissed: string[]; mistakes?: string | null; communicationNotes?: string | null; improvedAnswer?: string | null;
  improvedAnswerBy?: string | null; approvedAnswer?: string | null; approvedAt?: string | null; difficulty?: string | null; tags: string[];
  sourceUrl?: string | null; canonicalQuestionId?: string | null; createdAt: string; updatedAt: string; askedAt?: string | null; roundId?: string | null;
  _count?: { attempts: number };
}
export interface LessonQuestion { prompt: string; modelAnswer?: string; followUps?: string[]; source: string; occurrenceId?: string; hasModelAnswer?: boolean; attempted?: boolean }
export interface Lesson {
  id: string; key: string; order: number; kind: string; title: string; objectives: string[]; estimatedMinutes: number; explanation: string;
  examples?: string | null; questions: LessonQuestion[]; evaluationCriteria: string[]; commonMistakes: string[]; linkedOccurrenceIds: string[];
  scheduledDay?: number | null; status: string; revisionStatus: string; version: number; generator: string;
}
export interface Task {
  id: string; type: string; title: string; state: string; priority: number; executionMethod: string; routingReason?: string | null;
  attempts: number; maxAttempts: number; lastError?: string | null; scheduledFor: string; nextRetryAt?: string | null; createdAt: string;
  updatedAt: string; completedAt?: string | null; outputRef?: Record<string, unknown> | null; applicationId?: string | null; roundId?: string | null; courseId?: string | null;
  validation?: { ok: boolean; issues?: string[] } | null;
  history?: { id: string; attemptNo: number; method: string; status: string; error?: string | null; startedAt: string; finishedAt?: string | null }[];
}
export interface Evaluation {
  source: string; model?: string | null; score: number; rubric: { correctness: number; completeness: number; depth: number; clarity: number };
  missingConcepts: string[]; incorrectClaims: string[]; improvements: string[]; strongAnswer?: string | null; followUps: string[]; confidence: string;
}
export interface Attempt { id: string; prompt: string; answer: string; createdAt: string; evaluation?: Evaluation | null; questionIndex?: number | null }
