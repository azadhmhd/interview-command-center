// Development seed: one demo user with a realistic application, rounds and journal entries.
// Idempotent — skips if the demo user already exists. Never run against production.
import { PrismaClient } from '@prisma/client';
import '../src/config';
import { hashPassword } from '../src/common/crypto';
import { dedupeKey } from '../src/applications/applications';
import { normalizeQuestion } from '../src/knowledge/srs';

const prisma = new PrismaClient();
const EMAIL = process.env.SEED_DEMO_EMAIL || 'demo@icc.test';
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'demo-password-123';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');
  if (await prisma.user.findUnique({ where: { email: EMAIL } })) {
    console.log(`Demo user ${EMAIL} already exists — nothing to do.`);
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: EMAIL, name: 'Demo Candidate', passwordHash: await hashPassword(PASSWORD),
      memberships: { create: { role: 'OWNER', workspace: { create: { name: 'Demo workspace', personal: true, profile: { create: { fullName: 'Demo Candidate', headline: 'Senior Backend Engineer', yearsExperience: 7, targetRoles: ['Senior Backend Engineer'], coreTech: ['Python', 'Go', 'PostgreSQL'] } } } } } },
    },
    include: { memberships: true },
  });
  const workspaceId = user.memberships[0].workspaceId;
  const app = await prisma.application.create({
    data: {
      workspaceId, companyName: 'Example Fintech', jobTitle: 'Senior Backend Engineer', location: 'Remote', status: 'Technical Screen', priority: 'HIGH',
      dedupeKey: dedupeKey('Example Fintech', 'Senior Backend Engineer'), appliedAt: new Date(Date.now() - 10 * 864e5), salaryExpectation: 20000,
      jobDescription: 'Build payment APIs in Python (FastAPI) and Go on PostgreSQL and Redis. Event-driven architecture with Kafka. Observability, on-call, and an LLM-powered support assistant (RAG).',
      activities: { create: { workspaceId, type: 'created', message: 'Application created (seed)' } },
    },
  });
  const r1 = await prisma.interviewRound.create({ data: { workspaceId, applicationId: app.id, sequence: 1, type: 'recruiter_screen', title: 'Recruiter call', status: 'completed', outcome: 'passed', scheduledAt: new Date(Date.now() - 5 * 864e5), durationMinutes: 30 } });
  await prisma.interviewRound.create({ data: { workspaceId, applicationId: app.id, sequence: 2, type: 'system_design', title: 'System design', status: 'scheduled', scheduledAt: new Date(Date.now() + 4 * 864e5), durationMinutes: 60 } });
  for (const q of [
    { prompt: 'Walk me through your background.', originalAnswer: 'Seven years in backend engineering, mostly Python and Go…', confidence: 4 },
    { prompt: 'What are your salary expectations?', originalAnswer: 'Around 18k', confidence: 2, mistakes: 'Gave a single low number instead of a range', conceptsPartial: ['salary negotiation'] },
  ]) {
    const canonical = await prisma.canonicalQuestion.create({ data: { workspaceId, prompt: q.prompt, normalizedKey: normalizeQuestion(q.prompt), roundTypes: ['recruiter_screen'] } });
    await prisma.interviewQuestionOccurrence.create({ data: { workspaceId, applicationId: app.id, roundId: r1.id, canonicalQuestionId: canonical.id, source: 'REPORTED', askedAt: r1.scheduledAt, ...q } });
  }
  console.log(`Seeded demo user ${EMAIL} (password from SEED_DEMO_PASSWORD or the documented default). Milestones for the scheduled round are created when you edit/save it or via the UI.`);
}

main().finally(() => prisma.$disconnect());
