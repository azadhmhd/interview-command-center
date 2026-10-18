/** SM-2 spaced repetition. grade: 0 (blackout) … 5 (perfect). */
export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export function review(s: SrsState, grade: number, now = new Date()): SrsState & { dueAt: Date; masteryStatus: string } {
  const g = Math.max(0, Math.min(5, Math.round(grade)));
  let { easeFactor, intervalDays, repetitions } = s;
  if (g < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * easeFactor);
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));
  const masteryStatus = repetitions === 0 ? 'learning' : intervalDays >= 21 ? 'mastered' : 'reviewing';
  return { easeFactor: Math.round(easeFactor * 100) / 100, intervalDays, repetitions, dueAt: new Date(now.getTime() + intervalDays * 864e5), masteryStatus };
}

/** Map an evaluation score (0-10) onto an SM-2 grade. */
export const gradeFromScore = (score: number) => Math.max(0, Math.min(5, Math.round(score / 2)));

/** Normalise question text so the same question asked twice links to one canonical entry. */
export const normalizeQuestion = (s: string) =>
  s.toLowerCase().replace(/[`'"’“”]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim().slice(0, 300);
