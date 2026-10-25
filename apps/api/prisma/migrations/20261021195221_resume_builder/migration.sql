-- CreateTable
CREATE TABLE "ResumeDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "design" JSONB NOT NULL,
    "applicationId" TEXT,
    "jobLeadId" TEXT,
    "sourceDraftId" TEXT,
    "publishedResumeId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeDraft_workspaceId_updatedAt_idx" ON "ResumeDraft"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResumeDraft_applicationId_idx" ON "ResumeDraft"("applicationId");

-- CreateIndex
CREATE INDEX "ResumeDraft_jobLeadId_idx" ON "ResumeDraft"("jobLeadId");

-- AddForeignKey
ALTER TABLE "ResumeDraft" ADD CONSTRAINT "ResumeDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeDraft" ADD CONSTRAINT "ResumeDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeDraft" ADD CONSTRAINT "ResumeDraft_jobLeadId_fkey" FOREIGN KEY ("jobLeadId") REFERENCES "JobLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeDraft" ADD CONSTRAINT "ResumeDraft_publishedResumeId_fkey" FOREIGN KEY ("publishedResumeId") REFERENCES "ResumeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
