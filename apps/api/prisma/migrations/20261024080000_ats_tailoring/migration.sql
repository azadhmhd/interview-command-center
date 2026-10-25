-- AlterTable
ALTER TABLE "JobLead" ADD COLUMN     "atsMissing" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "atsScore" INTEGER,
ADD COLUMN     "atsStage" TEXT NOT NULL DEFAULT 'none';
