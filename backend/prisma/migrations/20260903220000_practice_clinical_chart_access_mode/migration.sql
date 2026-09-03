-- CreateEnum
CREATE TYPE "clinical_chart_access_mode" AS ENUM ('ASSIGNED_DOCTOR_ONLY', 'ALL_ACTIVE_DOCTORS');

-- AlterTable
ALTER TABLE "practices"
ADD COLUMN "clinical_chart_access_mode" "clinical_chart_access_mode" NOT NULL DEFAULT 'ASSIGNED_DOCTOR_ONLY';
