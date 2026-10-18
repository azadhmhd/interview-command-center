import { readSettings } from '../common/workspace-settings';
import { route } from './routing';

const s = readSettings({});
const up = { available: true, source: 'env' as const };
const down = { available: false, source: 'none' as const, reason: 'No LLM endpoint configured' };

describe('routing', () => {
  it('uses the LLM when available', () => {
    expect(route('answer_evaluation', s, up, false)).toMatchObject({ method: 'llm', state: 'queued' });
  });
  it('falls back to manual agent handoff with a reason when LLM is down', () => {
    const r = route('course_generation', s, down, false);
    expect(r).toMatchObject({ method: 'agent_manual', state: 'ready_for_agent' });
    expect(r.reason).toMatch(/No LLM endpoint configured/);
  });
  it('sends research to agents by default and uses CLI when enabled', () => {
    expect(route('company_research', s, up, false).method).toBe('agent_manual');
    expect(route('company_research', s, up, true)).toMatchObject({ method: 'agent_cli', state: 'queued' });
  });
  it('respects workspace overrides', () => {
    const custom = readSettings({ routing: { answer_evaluation: 'agent' } });
    expect(route('answer_evaluation', custom, up, false).method).toBe('agent_manual');
  });
});
