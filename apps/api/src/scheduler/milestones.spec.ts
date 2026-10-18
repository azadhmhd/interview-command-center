import { inQuietHours, outOfQuiet, planMilestones, zoned } from './milestones';

const tz = 'Asia/Dubai'; // UTC+4, no DST
const quietHours = { start: 22, end: 7 };

describe('milestones', () => {
  it('computes wall-clock times in the workspace timezone', () => {
    expect(zoned(2026, 10, 20, 9, tz).toISOString()).toBe('2026-10-20T05:00:00.000Z');
  });

  it('plans T-3..T-0 plus post-interview capture', () => {
    const interviewAt = new Date('2026-10-23T10:00:00Z'); // 14:00 Dubai
    const m = planMilestones({ interviewAt, now: new Date('2026-10-18T06:00:00Z'), tz, quietHours, milestoneDays: [3, 2, 1, 0] });
    expect(m.map((x) => x.key)).toEqual(['t-3', 't-2', 't-1', 't-0', 'post']);
    expect(m[0]).toMatchObject({ task: 'course_generation', dueAt: new Date('2026-10-20T05:00:00Z') });
    expect(m[2].task).toBe('revision_notes');
    expect(m[3].dueAt).toEqual(new Date('2026-10-23T08:00:00Z'));
  });

  it('does not generate missed historical milestones on short notice but creates the course now', () => {
    const now = new Date('2026-10-18T06:00:00Z');
    const m = planMilestones({ interviewAt: new Date('2026-10-19T10:00:00Z'), now, tz, quietHours, milestoneDays: [3, 2, 1, 0] });
    expect(m.find((x) => x.key === 't-2')).toBeUndefined();
    const course = m.find((x) => x.task === 'course_generation')!;
    expect(course.dueAt).toEqual(now);
    expect(m.every((x) => x.dueAt >= now)).toBe(true);
  });

  it('respects quiet hours', () => {
    const late = new Date('2026-10-18T19:30:00Z'); // 23:30 Dubai
    expect(inQuietHours(late, tz, quietHours)).toBe(true);
    expect(outOfQuiet(late, tz, quietHours).toISOString()).toBe('2026-10-19T03:00:00.000Z'); // 07:00 Dubai
  });
});
