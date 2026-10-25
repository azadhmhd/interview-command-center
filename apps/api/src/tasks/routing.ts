import type { WorkspaceSettings } from '../common/workspace-settings';
import type { LlmStatus } from '../llm/llm.service';

export type ExecutionMethod = 'llm' | 'agent_cli' | 'agent_manual' | 'deterministic';

/** Defaults from the spec; overridable per workspace in settings.routing. */
export const DEFAULT_ROUTES: Record<string, 'llm' | 'agent' | 'auto'> = {
  course_generation: 'auto',
  lesson_regeneration: 'llm',
  answer_evaluation: 'llm',
  code_review: 'auto',
  answer_improvement: 'llm',
  question_extraction: 'llm',
  resume_extraction: 'llm',
  resume_draft_import: 'llm',
  resume_tailoring: 'llm',
  revision_notes: 'llm',
  gap_analysis: 'llm',
  mock_generation: 'llm',
  company_research: 'agent', // needs web access → subscription agent
  job_match: 'llm',
  apply_answers: 'llm',
  job_application: 'agent', // needs a real browser → always a manual agent session (Claude in Chrome)
};

export interface Route {
  method: ExecutionMethod;
  state: 'queued' | 'ready_for_agent';
  reason: string;
}

/** Pure routing decision. Never silently switches providers: every fallback is recorded in `reason`. */
export function route(type: string, settings: WorkspaceSettings, llm: LlmStatus, cliEnabled: boolean): Route {
  const pref = settings.routing[type] ?? DEFAULT_ROUTES[type] ?? 'llm';
  // Filling a live application form needs a visible browser the headless CLI and LLM don't have.
  if (type === 'job_application') return { method: 'agent_manual', state: 'ready_for_agent', reason: 'Applying needs a browser → run it with Claude Code + Claude in Chrome (export the task package)' };
  const agent = (why: string): Route => cliEnabled
    ? { method: 'agent_cli', state: 'queued', reason: `${why} → Claude Code headless adapter` }
    : { method: 'agent_manual', state: 'ready_for_agent', reason: `${why} → waiting for manual agent execution (export the task package)` };

  if (pref === 'agent') return agent('Routing policy prefers a coding agent');
  if (llm.available) return { method: 'llm', state: 'queued', reason: pref === 'auto' ? 'Configured LLM endpoint available' : 'Routing policy: LLM endpoint' };
  if (pref === 'auto' || settings.fallbackToAgent) return agent(`LLM unavailable (${llm.reason})`);
  // No allowed fallback: keep the task, a human decides. Manual handoff stays possible from the task page.
  return { method: 'agent_manual', state: 'ready_for_agent', reason: `LLM unavailable (${llm.reason}); agent fallback disabled — configure the LLM and retry, or run it manually` };
}
