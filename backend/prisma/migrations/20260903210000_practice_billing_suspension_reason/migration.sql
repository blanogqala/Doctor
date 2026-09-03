-- CreateEnum
CREATE TYPE "subscription_suspension_reason" AS ENUM ('BILLING_OVERDUE', 'MANUAL');

-- AlterTable
ALTER TABLE "practices"
ADD COLUMN "subscription_suspension_reason" "subscription_suspension_reason",
ADD COLUMN "subscription_suspended_at" TIMESTAMP(3);
