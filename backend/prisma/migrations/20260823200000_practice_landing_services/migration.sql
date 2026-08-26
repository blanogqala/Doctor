-- AlterTable
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "landing_services" JSONB;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "services_intro" TEXT;
