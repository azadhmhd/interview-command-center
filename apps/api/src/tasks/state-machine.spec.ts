import { assertTransition, backoffMs, canTransition, isTerminal } from './state-machine';

describe('task state machine', () => {
  it('allows the happy paths', () => {
    expect(canTransition('scheduled', 'queued')).toBe(true);
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);
    expect(canTransition('running', 'retry_wait')).toBe(true);
    expect(canTransition('retry_wait', 'queued')).toBe(true);
    expect(canTransition('ready_for_agent', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'awaiting_review')).toBe(true);
    expect(canTransition('awaiting_review', 'completed')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
  });
  it('rejects invalid moves', () => {
    expect(canTransition('completed', 'queued')).toBe(false);
    expect(canTransition('cancelled', 'running')).toBe(false);
    expect(canTransition('scheduled', 'completed')).toBe(false);
    expect(() => assertTransition('completed', 'running')).toThrow(/cannot move/);
  });
  it('knows terminal states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('failed')).toBe(false);
  });
  it('backs off exponentially with a cap', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});
