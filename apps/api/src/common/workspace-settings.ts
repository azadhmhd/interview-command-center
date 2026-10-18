import { z } from 'zod';

export const DEFAULT_STATUSES = [
  'Saved', 'Applied', 'Recruiter Screen', 'Technical Screen', 'Coding Round', 'System Design',
  'Hiring Manager', 'Final Round', 'Offer', 'Rejected', 'Withdrawn', 'On Hold',
];

export const DEFAULT_ROUND_TYPES: { key: string; label: string }[] = [
  { key: 'recruiter_screen', label: 'HR / Recruiter screen' },
  { key: 'technical_screen', label: 'Technical screen' },
  { key: 'coding', label: 'Coding / DSA' },
  { key: 'backend', label: 'Backend engineering' },
  { key: 'system_design', label: 'System design' },
  { key: 'ai_llm', label: 'AI / LLM engineering' },
  { key: 'behavioral', label: 'Behavioral / Hiring manager' },
  { key: 'take_home', label: 'Take-home / Code review' },
];

const routeChoice = z.enum(['llm', 'agent', 'auto']);

export const workspaceSettingsSchema = z.object({
  statuses: z.array(z.string().min(1).max(60)).min(1).max(40).default(DEFAULT_STATUSES),
  roundTypes: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/).max(40), label: z.string().max(80) }))
    .min(1).max(40).default(DEFAULT_ROUND_TYPES),
  timezone: z.string().default('UTC'),
  quietHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
    .default({ start: 22, end: 7 }),
  dailyStudyHours: z.number().min(0.5).max(16).default(2),
  /** days before the interview at which milestones fire */
  milestoneDays: z.array(z.number().int().min(0).max(14)).default([3, 2, 1, 0]),
  followUpDays: z.number().int().min(1).max(60).default(7),
  routing: z.record(z.string(), routeChoice).default({}),
  /** when the LLM is unavailable, hand off to a manual agent task instead of only retrying */
  fallbackToAgent: z.boolean().default(true),
  /** stop AI/agent output in awaiting_review for manual approval. Off: results apply and complete automatically. */
  reviewAiOutput: z.boolean().default(false),
  /** reveal model answers before an attempt (learning mode) */
  learningMode: z.boolean().default(false),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export function readSettings(raw: unknown): WorkspaceSettings {
  const r = workspaceSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : workspaceSettingsSchema.parse({});
}
