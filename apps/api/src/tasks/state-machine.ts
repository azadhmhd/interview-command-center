export const TASK_STATES = [
  'scheduled', 'queued', 'ready_for_agent', 'submitted', 'running', 'awaiting_review', 'completed', 'retry_wait', 'failed', 'cancelled',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

const T: Record<TaskState, TaskState[]> = {
  scheduled: ['queued', 'ready_for_agent', 'cancelled'],
  queued: ['running', 'ready_for_agent', 'cancelled'],
  ready_for_agent: ['submitted', 'queued', 'awaiting_review', 'completed', 'cancelled'],
  submitted: ['running', 'queued', 'awaiting_review', 'completed', 'failed', 'ready_for_agent', 'cancelled'],
  running: ['awaiting_review', 'completed', 'retry_wait', 'failed', 'ready_for_agent', 'cancelled'],
  retry_wait: ['queued', 'ready_for_agent', 'cancelled'],
  awaiting_review: ['completed', 'ready_for_agent', 'queued', 'cancelled'],
  failed: ['queued', 'ready_for_agent', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const canTransition = (from: TaskState, to: TaskState) => T[from]?.includes(to) ?? false;
export const isTerminal = (s: TaskState) => T[s].length === 0;
/** States from which an import of agent output is accepted. */
export const IMPORTABLE: TaskState[] = ['ready_for_agent', 'submitted', 'failed', 'retry_wait', 'queued'];

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Task cannot move from "${from}" to "${to}"`);
  }
}

export function assertTransition(from: string, to: TaskState) {
  if (!canTransition(from as TaskState, to)) throw new InvalidTransitionError(from, to);
}

/** Exponential backoff with cap: 30s, 60s, 120s ... ≤ 30 min. */
export const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
