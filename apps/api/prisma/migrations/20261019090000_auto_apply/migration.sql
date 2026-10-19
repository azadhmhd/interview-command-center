-- Auto Apply: separate job-discovery and application-automation section.
-- Adds new tables only; existing tracker tables are untouched.

-- CreateEnum
CREATE TYPE "JobSourceType" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKABLE', 'ALERT_EMAIL', 'MANUAL_URL');

-- CreateEnum
CREATE TYPE "JobLeadStatus" AS ENUM ('DISCOVERED', 'EVALUATED', 'SHORTLISTED', 'READY_FOR_REVIEW', 'APPROVED', 'APPLYING', 'SUBMITTED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN', 'NEEDS_ATTENTION', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApplyMethod" AS ENUM ('MANUAL', 'PREFILL', 'AUTO', 'AGENT');

-- CreateEnum
CREATE TYPE "ApplyAttemptStatus" AS ENUM ('RUNNING', 'SUBMIT_CLICKED', 'SUBMITTED', 'BLOCKED', 'NEEDS_ATTENTION', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "JobSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastFoundCount" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceType" "JobSourceType" NOT NULL,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "applyUrl" TEXT,
    "atsType" TEXT NOT NULL DEFAULT 'other',
    "atsMeta" JSONB,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "remote" BOOLEAN,
    "employmentType" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "publishedAt" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL,
    "status" "JobLeadStatus" NOT NULL DEFAULT 'DISCOVERED',
    "statusReason" TEXT,
    "fitScore" INTEGER,
    "fitBreakdown" JSONB,
    "fitExplanation" TEXT,
    "blockers" TEXT[],
    "aiFit" JSONB,
    "resumeId" TEXT,
    "applyKit" JSONB,
    "kitStatus" TEXT NOT NULL DEFAULT 'none',
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "discoveredVia" TEXT[],
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "trackerApplicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplyAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "method" "ApplyMethod" NOT NULL,
    "status" "ApplyAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "runner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "evidence" JSONB,
    "filledFields" JSONB,
    "missingFields" TEXT[],
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitClickedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ApplyAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoApplyConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "standingAnswers" JSONB NOT NULL DEFAULT '{}',
    "autoSubmit" BOOLEAN NOT NULL DEFAULT false,
    "minShortlistScore" INTEGER NOT NULL DEFAULT 60,
    "minAutoApplyScore" INTEGER NOT NULL DEFAULT 75,
    "dailyApplyCap" INTEGER NOT NULL DEFAULT 10,
    "allowAiFreeText" BOOLEAN NOT NULL DEFAULT true,
    "discoveryHours" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoApplyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_workspaceId_type_name_key" ON "JobSource"("workspaceId", "type", "name");

-- CreateIndex
CREATE INDEX "JobLead_workspaceId_status_idx" ON "JobLead"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "JobLead_workspaceId_fitScore_idx" ON "JobLead"("workspaceId", "fitScore");

-- CreateIndex
CREATE UNIQUE INDEX "JobLead_workspaceId_dedupeKey_key" ON "JobLead"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ApplyAttempt_workspaceId_status_idx" ON "ApplyAttempt"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplyAttempt_leadId_attemptNo_key" ON "ApplyAttempt"("leadId", "attemptNo");

-- CreateIndex
CREATE INDEX "RecruiterContact_workspaceId_company_idx" ON "RecruiterContact"("workspaceId", "company");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterContact_workspaceId_email_key" ON "RecruiterContact"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "AutoApplyConfig_workspaceId_key" ON "AutoApplyConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLead" ADD CONSTRAINT "JobLead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLead" ADD CONSTRAINT "JobLead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLead" ADD CONSTRAINT "JobLead_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "ResumeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyAttempt" ADD CONSTRAINT "ApplyAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyAttempt" ADD CONSTRAINT "ApplyAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "JobLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterContact" ADD CONSTRAINT "RecruiterContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterContact" ADD CONSTRAINT "RecruiterContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "JobLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoApplyConfig" ADD CONSTRAINT "AutoApplyConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

