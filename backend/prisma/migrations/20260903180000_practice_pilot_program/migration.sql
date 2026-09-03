-- AlterTable
ALTER TABLE "practices" ADD COLUMN "pilot_program_granted_at" TIMESTAMP(3),
ADD COLUMN "pilot_program_starts_at" TIMESTAMP(3),
ADD COLUMN "pilot_program_ends_at" TIMESTAMP(3);
