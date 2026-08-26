-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('SOLO', 'SMALL_PRACTICE', 'CLINIC', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "subscription_invoice_status" AS ENUM ('DUE', 'PAYMENT_REPORTED', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "subscription_payment_method" AS ENUM ('EFT', 'ONLINE_GATEWAY', 'MANUAL_ADJUSTMENT');

-- AlterTable
ALTER TABLE "practices"
ADD COLUMN "subscription_plan" "subscription_plan" NOT NULL DEFAULT 'SOLO',
ADD COLUMN "doctor_seat_limit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "owner_profile_id" UUID;

-- AlterTable
ALTER TABLE "audit_logs"
ADD COLUMN "actor_super_admin_id" UUID;

-- CreateTable
CREATE TABLE "practice_invitations" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "hpcsa_number" TEXT,
    "is_practice_owner" BOOLEAN NOT NULL DEFAULT false,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "invited_by_profile_id" UUID,
    "invited_by_super_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_subscription_invoices" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "subscription_invoice_status" NOT NULL DEFAULT 'DUE',
    "due_at" TIMESTAMP(3) NOT NULL,
    "payment_reported_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_method" "subscription_payment_method",
    "verified_by_super_admin_id" UUID,
    "external_provider" TEXT,
    "external_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practices_owner_profile_id_key" ON "practices"("owner_profile_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_super_admin_id_idx" ON "audit_logs"("actor_super_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_invitations_token_hash_key" ON "practice_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "practice_invitations_practice_id_idx" ON "practice_invitations"("practice_id");

-- CreateIndex
CREATE INDEX "practice_invitations_email_idx" ON "practice_invitations"("email");

-- CreateIndex
CREATE INDEX "practice_invitations_expires_at_idx" ON "practice_invitations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "practice_subscription_invoices_invoice_number_key" ON "practice_subscription_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "practice_subscription_invoices_practice_id_idx" ON "practice_subscription_invoices"("practice_id");

-- CreateIndex
CREATE INDEX "practice_subscription_invoices_status_idx" ON "practice_subscription_invoices"("status");

-- CreateIndex
CREATE INDEX "practice_subscription_invoices_due_at_idx" ON "practice_subscription_invoices"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "practice_subscription_invoices_practice_id_period_start_period_end_key" ON "practice_subscription_invoices"("practice_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_profile_id_idx" ON "password_reset_tokens"("profile_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_super_admin_id_fkey" FOREIGN KEY ("actor_super_admin_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_invitations" ADD CONSTRAINT "practice_invitations_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_invitations" ADD CONSTRAINT "practice_invitations_invited_by_profile_id_fkey" FOREIGN KEY ("invited_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_invitations" ADD CONSTRAINT "practice_invitations_invited_by_super_admin_id_fkey" FOREIGN KEY ("invited_by_super_admin_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_subscription_invoices" ADD CONSTRAINT "practice_subscription_invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_subscription_invoices" ADD CONSTRAINT "practice_subscription_invoices_verified_by_super_admin_id_fkey" FOREIGN KEY ("verified_by_super_admin_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill seat limits so existing Practices are never immediately blocked.
UPDATE "practices" p
SET
  "subscription_plan" = CASE
    WHEN COALESCE(c.doctor_count, 0) <= 1 THEN 'SOLO'::"subscription_plan"
    WHEN c.doctor_count <= 3 THEN 'SMALL_PRACTICE'::"subscription_plan"
    WHEN c.doctor_count <= 5 THEN 'CLINIC'::"subscription_plan"
    ELSE 'ENTERPRISE'::"subscription_plan"
  END,
  "doctor_seat_limit" = CASE
    WHEN COALESCE(c.doctor_count, 0) <= 1 THEN GREATEST(1, COALESCE(c.doctor_count, 0))
    WHEN c.doctor_count <= 3 THEN GREATEST(3, c.doctor_count)
    WHEN c.doctor_count <= 5 THEN GREATEST(5, c.doctor_count)
    ELSE c.doctor_count
  END
FROM (
  SELECT
    pr."practice_id",
    COUNT(*)::INTEGER AS doctor_count
  FROM "profiles" pr
  WHERE pr."role" = 'DOCTOR'
    AND pr."is_active" = true
    AND pr."soft_deleted_at" IS NULL
  GROUP BY pr."practice_id"
) c
WHERE p."id" = c."practice_id";
