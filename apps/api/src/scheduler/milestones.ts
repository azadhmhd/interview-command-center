/** Pure, AI-free schedule planning. All times are UTC Dates; local-time rules use the workspace timezone. */

export function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

/** UTC instant for a wall-clock time in `tz`. */
export function zoned(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h);
  const p = localParts(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return new Date(guess - offset);
}

export function inQuietHours(d: Date, tz: string, q: { start: number; end: number }) {
  const h = localParts(d, tz).h;
  return q.start === q.end ? false : q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

/** Move a time out of quiet hours to the end of the quiet window. */
export function outOfQuiet(d: Date, tz: string, q: { start: number; end: number }): Date {
  if (!inQuietHours(d, tz, q)) return d;
  const p = localParts(d, tz);
  let end = zoned(p.y, p.m, p.d, q.end, tz);
  if (end <= d) end = new Date(end.getTime() + 864e5);
  return end;
}

export interface Milestone {
  key: string;
  kind: 'prep_milestone' | 'interview_day' | 'post_interview';
  title: string;
  body: string;
  dueAt: Date;
  task?: 'course_generation' | 'revision_notes';
}

export function planMilestones(opts: {
  interviewAt: Date; durationMinutes?: number | null; now: Date; tz: string; quietHours: { start: number; end: number }; milestoneDays: number[];
}): Milestone[] {
  const { interviewAt, now, tz, quietHours } = opts;
  const days = [...new Set(opts.milestoneDays)].sort((a, b) => b - a);
  const maxDay = days[0] ?? 0;
  const ip = localParts(interviewAt, tz);
  const out: Milestone[] = [];
  for (const d of days) {
    let dueAt: Date;
    if (d === 0) dueAt = new Date(interviewAt.getTime() - 2 * 36e5);
    else {
      const day = new Date(Date.UTC(ip.y, ip.m - 1, ip.d) - d * 864e5);
      dueAt = zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, tz);
    }
    dueAt = outOfQuiet(dueAt, tz, quietHours);
    if (dueAt >= interviewAt) dueAt = new Date(interviewAt.getTime() - 30 * 60e3);
    const m: Milestone =
      d === 0 ? { key: 't-0', kind: 'interview_day', title: 'Interview today: final review', body: 'Read the final revision notes, unresolved risks and your questions for the interviewer. Check the meeting link.', dueAt }
      : d === maxDay ? { key: `t-${d}`, kind: 'prep_milestone', title: 'Start preparation: crash course ready', body: 'Review the prioritised topic checklist and the biggest gaps first.', dueAt, task: 'course_generation' }
      : d === 1 ? { key: 't-1', kind: 'prep_milestone', title: 'Mock interview & model answers', body: 'Run the targeted mock interview, review model answers and the final revision notes.', dueAt, task: 'revision_notes' }
      : { key: `t-${d}`, kind: 'prep_milestone', title: 'Practice weak topics', body: 'Answer practice questions, revisit weak topics and do the coding / design exercises.', dueAt };
    out.push(m);
  }
  // Short notice: never create missed historical milestones, but the course must exist now.
  const future = out.filter((m) => m.dueAt > now);
  const skippedCourse = out.find((m) => m.task === 'course_generation' && m.dueAt <= now);
  if (skippedCourse && interviewAt > now) future.unshift({ ...skippedCourse, dueAt: now, body: `Short notice: ${skippedCourse.body}` });
  const post = new Date(interviewAt.getTime() + ((opts.durationMinutes ?? 60) + 30) * 60e3);
  if (post > now) {
    future.push({ key: 'post', kind: 'post_interview', title: 'Capture questions & answers while fresh', body: 'Record every question, your original answer, mistakes and the interviewer\'s reactions.', dueAt: outOfQuiet(post, tz, quietHours) });
  }
  return future;
}
