import { gradeFromScore, normalizeQuestion, review } from './srs';

describe('SM-2', () => {
  const start = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
  it('grows intervals on good recall', () => {
    const a = review(start, 5);
    expect(a.intervalDays).toBe(1);
    const b = review(a, 5);
    expect(b.intervalDays).toBe(6);
    const c = review(b, 4);
    expect(c.intervalDays).toBe(Math.round(6 * b.easeFactor));
    expect(c.masteryStatus).toBe('reviewing');
  });
  it('resets on failure and never drops ease below 1.3', () => {
    let s = review(start, 5);
    for (let i = 0; i < 10; i++) s = review(s, 0);
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
    expect(s.masteryStatus).toBe('learning');
  });
  it('maps scores and normalises questions', () => {
    expect(gradeFromScore(10)).toBe(5);
    expect(gradeFromScore(3)).toBe(2);
    expect(normalizeQuestion('What is the GIL?')).toBe(normalizeQuestion('  what is the "GIL"  '));
  });
});
