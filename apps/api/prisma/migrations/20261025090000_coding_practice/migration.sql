-- CreateTable
CREATE TABLE "CodingSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "problemSlug" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "passed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "taskId" TEXT,
    "review" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodingSubmission_workspaceId_problemSlug_createdAt_idx" ON "CodingSubmission"("workspaceId", "problemSlug", "createdAt");

-- AddForeignKey
ALTER TABLE "CodingSubmission" ADD CONSTRAINT "CodingSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
