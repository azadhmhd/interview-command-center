-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ShareResource" AS ENUM ('APPLICATION', 'COURSE');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('REPORTED', 'PUBLIC_REPORT', 'AI_PREDICTED', 'PRACTICE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordShare" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" "ShareResource" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RecordShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ip" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fullName" TEXT,
    "headline" TEXT,
    "location" TEXT,
    "yearsExperience" INTEGER,
    "targetRoles" TEXT[],
    "secondaryRoles" TEXT[],
    "workBalance" TEXT,
    "coreTech" TEXT[],
    "aiInterests" TEXT[],
    "noticePeriodDays" INTEGER,
    "salaryTarget" INTEGER,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'AED',
    "summary" TEXT,
    "confirmedFacts" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedText" TEXT,
    "structured" JSONB,
    "structuredStatus" TEXT NOT NULL DEFAULT 'none',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyWebsite" TEXT,
    "location" TEXT,
    "companyNotes" TEXT,
    "jobTitle" TEXT NOT NULL,
    "seniority" TEXT,
    "jobDescription" TEXT,
    "jobUrl" TEXT,
    "source" TEXT,
    "appliedAt" TIMESTAMP(3),
    "resumeId" TEXT,
    "coverLetter" TEXT,
    "salaryExpectation" INTEGER,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'AED',
    "benefits" TEXT,
    "noticePeriodDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Saved',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "offerDetails" TEXT,
    "rejectionReason" TEXT,
    "withdrawalReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'recruiter',
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "roundId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "label" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storagePath" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewRound" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "interviewer" TEXT,
    "format" TEXT,
    "meetingLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "feedback" TEXT,
    "nextSteps" TEXT,
    "notes" TEXT,
    "confidence" INTEGER,
    "studyHoursAvailable" INTEGER,
    "prepIntensity" TEXT NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestionOccurrence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "roundId" TEXT,
    "canonicalQuestionId" TEXT,
    "source" "QuestionSource" NOT NULL DEFAULT 'REPORTED',
    "prompt" TEXT NOT NULL,
    "originalAnswer" TEXT,
    "followUps" TEXT,
    "problemStatement" TEXT,
    "codeSnippet" TEXT,
    "codeLanguage" TEXT,
    "testCases" TEXT,
    "confidence" INTEGER,
    "conceptsCorrect" TEXT[],
    "conceptsPartial" TEXT[],
    "conceptsMissed" TEXT[],
    "mistakes" TEXT,
    "communicationNotes" TEXT,
    "improvedAnswer" TEXT,
    "improvedAnswerBy" TEXT,
    "approvedAnswer" TEXT,
    "approvedAt" TIMESTAMP(3),
    "difficulty" TEXT,
    "tags" TEXT[],
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "askedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("prompt", '')), 'A') || setweight(to_tsvector('english', coalesce("originalAnswer", '') || ' ' || coalesce("approvedAnswer", '') || ' ' || coalesce("improvedAnswer", '')), 'B') || setweight(to_tsvector('english', coalesce("mistakes", '') || ' ' || coalesce("followUps", '') || ' ' || coalesce("problemStatement", '')), 'C')) STORED,

    CONSTRAINT "InterviewQuestionOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalQuestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "tags" TEXT[],
    "difficulty" TEXT,
    "roundTypes" TEXT[],
    "masteryStatus" TEXT NOT NULL DEFAULT 'new',
    "confidence" INTEGER,
    "bestAnswer" TEXT,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "inRevision" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("prompt", '')), 'A') || setweight(to_tsvector('english', coalesce("bestAnswer", '')), 'B')) STORED,

    CONSTRAINT "CanonicalQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparationCourse" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "roundId" TEXT,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "generator" TEXT NOT NULL DEFAULT 'deterministic',
    "model" TEXT,
    "contextSnapshot" JSONB NOT NULL,
    "contextHash" TEXT NOT NULL,
    "overview" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparationModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" TEXT[],
    "estimatedMinutes" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "examples" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "evaluationCriteria" TEXT[],
    "commonMistakes" TEXT[],
    "linkedOccurrenceIds" TEXT[],
    "scheduledDay" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "revisionStatus" TEXT NOT NULL DEFAULT 'none',
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "generator" TEXT NOT NULL DEFAULT 'deterministic',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "courseId" TEXT,
    "roundId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'mock',
    "roundType" TEXT,
    "title" TEXT NOT NULL,
    "learningMode" BOOLEAN NOT NULL DEFAULT false,
    "questions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "canonicalQuestionId" TEXT,
    "sessionId" TEXT,
    "lessonId" TEXT,
    "questionIndex" INTEGER,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "clientKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEvaluation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "rubric" JSONB NOT NULL,
    "missingConcepts" TEXT[],
    "incorrectClaims" TEXT[],
    "improvements" TEXT[],
    "strongAnswer" TEXT,
    "followUps" TEXT[],
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "roundId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "firedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT NOT NULL,
    "executionMethod" TEXT NOT NULL,
    "routingReason" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "applicationId" TEXT,
    "roundId" TEXT,
    "courseId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 180000,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "outputRef" JSONB,
    "validation" JSONB,
    "resultHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "worker" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT,
    "host" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMConfiguration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT,
    "apiKeyLast4" TEXT,
    "model" TEXT,
    "evaluationModel" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "allowExternalTransmission" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "RecordShare_granteeId_idx" ON "RecordShare"("granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordShare_resourceType_resourceId_granteeId_key" ON "RecordShare"("resourceType", "resourceId", "granteeId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_workspaceId_key" ON "CandidateProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeDocument_workspaceId_label_version_key" ON "ResumeDocument"("workspaceId", "label", "version");

-- CreateIndex
CREATE INDEX "Application_workspaceId_status_idx" ON "Application"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Application_workspaceId_dedupeKey_idx" ON "Application"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ApplicationActivity_applicationId_createdAt_idx" ON "ApplicationActivity"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewRound_workspaceId_scheduledAt_idx" ON "InterviewRound"("workspaceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewRound_applicationId_sequence_idx" ON "InterviewRound"("applicationId", "sequence");

-- CreateIndex
CREATE INDEX "InterviewQuestionOccurrence_workspaceId_source_idx" ON "InterviewQuestionOccurrence"("workspaceId", "source");

-- CreateIndex
CREATE INDEX "InterviewQuestionOccurrence_search_idx" ON "InterviewQuestionOccurrence" USING GIN ("search");

-- CreateIndex
CREATE INDEX "InterviewQuestionOccurrence_tags_idx" ON "InterviewQuestionOccurrence" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "InterviewQuestionOccurrence_roundId_idx" ON "InterviewQuestionOccurrence"("roundId");

-- CreateIndex
CREATE INDEX "CanonicalQuestion_workspaceId_dueAt_idx" ON "CanonicalQuestion"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "CanonicalQuestion_search_idx" ON "CanonicalQuestion" USING GIN ("search");

-- CreateIndex
CREATE INDEX "CanonicalQuestion_tags_idx" ON "CanonicalQuestion" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalQuestion_workspaceId_normalizedKey_key" ON "CanonicalQuestion"("workspaceId", "normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "PreparationModule_courseId_key_key" ON "PreparationModule"("courseId", "key");

-- CreateIndex
CREATE INDEX "AnswerAttempt_canonicalQuestionId_createdAt_idx" ON "AnswerAttempt"("canonicalQuestionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerAttempt_workspaceId_clientKey_key" ON "AnswerAttempt"("workspaceId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerEvaluation_attemptId_key" ON "AnswerEvaluation"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_workspaceId_applicationId_url_key" ON "ResearchSource"("workspaceId", "applicationId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_idempotencyKey_key" ON "Reminder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_workspaceId_dueAt_idx" ON "Reminder"("workspaceId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_idempotencyKey_key" ON "AgentTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentTask_state_scheduledFor_idx" ON "AgentTask"("state", "scheduledFor");

-- CreateIndex
CREATE INDEX "AgentTask_workspaceId_state_idx" ON "AgentTask"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "AgentTaskAttempt_taskId_idx" ON "AgentTaskAttempt"("taskId");

-- CreateIndex
CREATE INDEX "AIUsageRecord_workspaceId_createdAt_idx" ON "AIUsageRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LLMConfiguration_workspaceId_key" ON "LLMConfiguration"("workspaceId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordShare" ADD CONSTRAINT "RecordShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordShare" ADD CONSTRAINT "RecordShare_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeDocument" ADD CONSTRAINT "ResumeDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "ResumeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationActivity" ADD CONSTRAINT "ApplicationActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationActivity" ADD CONSTRAINT "ApplicationActivity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestionOccurrence" ADD CONSTRAINT "InterviewQuestionOccurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestionOccurrence" ADD CONSTRAINT "InterviewQuestionOccurrence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestionOccurrence" ADD CONSTRAINT "InterviewQuestionOccurrence_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestionOccurrence" ADD CONSTRAINT "InterviewQuestionOccurrence_canonicalQuestionId_fkey" FOREIGN KEY ("canonicalQuestionId") REFERENCES "CanonicalQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalQuestion" ADD CONSTRAINT "CanonicalQuestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationCourse" ADD CONSTRAINT "PreparationCourse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationCourse" ADD CONSTRAINT "PreparationCourse_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationCourse" ADD CONSTRAINT "PreparationCourse_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationModule" ADD CONSTRAINT "PreparationModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "PreparationCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "PreparationCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "InterviewQuestionOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_canonicalQuestionId_fkey" FOREIGN KEY ("canonicalQuestionId") REFERENCES "CanonicalQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "PreparationModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEvaluation" ADD CONSTRAINT "AnswerEvaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AnswerAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "PreparationCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskAttempt" ADD CONSTRAINT "AgentTaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageRecord" ADD CONSTRAINT "AIUsageRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMConfiguration" ADD CONSTRAINT "LLMConfiguration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
