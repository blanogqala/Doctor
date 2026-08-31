-- Reception-created patients: chart may exist without a portal Profile.

CREATE TYPE "patient_registration_source" AS ENUM ('SELF_REGISTERED', 'RECEPTION_CREATED');
CREATE TYPE "patient_portal_status" AS ENUM ('NO_PORTAL_ACCESS', 'INVITED', 'ACTIVE', 'DISABLED');

ALTER TABLE "patients"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "registration_source" "patient_registration_source" NOT NULL DEFAULT 'SELF_REGISTERED',
  ADD COLUMN "portal_status" "patient_portal_status" NOT NULL DEFAULT 'ACTIVE';

-- Backfill names from linked profile. Single-token names copy into both fields.
UPDATE "patients" p
SET
  "first_name" = CASE
    WHEN position(' ' in btrim(pr."full_name")) > 0
      THEN split_part(btrim(pr."full_name"), ' ', 1)
    ELSE btrim(pr."full_name")
  END,
  "last_name" = CASE
    WHEN position(' ' in btrim(pr."full_name")) > 0
      THEN btrim(substring(btrim(pr."full_name") from position(' ' in btrim(pr."full_name")) + 1))
    ELSE btrim(pr."full_name")
  END,
  "email" = pr."email",
  "phone" = pr."phone",
  "registration_source" = CASE
    WHEN pr."activated_at" IS NULL THEN 'RECEPTION_CREATED'::"patient_registration_source"
    ELSE 'SELF_REGISTERED'::"patient_registration_source"
  END,
  "portal_status" = CASE
    WHEN pr."activated_at" IS NOT NULL AND pr."is_active" = true THEN 'ACTIVE'::"patient_portal_status"
    WHEN pr."activated_at" IS NULL THEN 'INVITED'::"patient_portal_status"
    ELSE 'DISABLED'::"patient_portal_status"
  END
FROM "profiles" pr
WHERE p."profile_id" = pr."id";

UPDATE "patients"
SET
  "first_name" = COALESCE(NULLIF(btrim("first_name"), ''), 'Unknown'),
  "last_name" = COALESCE(NULLIF(btrim("last_name"), ''), 'Unknown');

ALTER TABLE "patients"
  ALTER COLUMN "first_name" SET NOT NULL,
  ALTER COLUMN "last_name" SET NOT NULL;

-- Assumption: historical origin cannot be proven for activated accounts; those remain SELF_REGISTERED.

ALTER TABLE "patients" ALTER COLUMN "profile_id" DROP NOT NULL;

ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_profile_id_fkey";
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "patients_practice_id_registration_source_idx" ON "patients"("practice_id", "registration_source");
CREATE INDEX "patients_practice_id_portal_status_idx" ON "patients"("practice_id", "portal_status");

CREATE UNIQUE INDEX "patients_practice_id_email_lower_key"
  ON "patients" ("practice_id", lower("email"))
  WHERE "email" IS NOT NULL;

CREATE TABLE "patient_portal_invitations" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_portal_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_portal_invitations_token_hash_key" ON "patient_portal_invitations"("token_hash");
CREATE INDEX "patient_portal_invitations_patient_id_idx" ON "patient_portal_invitations"("patient_id");
CREATE INDEX "patient_portal_invitations_practice_id_idx" ON "patient_portal_invitations"("practice_id");
CREATE INDEX "patient_portal_invitations_expires_at_idx" ON "patient_portal_invitations"("expires_at");

ALTER TABLE "patient_portal_invitations"
  ADD CONSTRAINT "patient_portal_invitations_practice_id_fkey"
  FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patient_portal_invitations"
  ADD CONSTRAINT "patient_portal_invitations_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patient_portal_invitations"
  ADD CONSTRAINT "patient_portal_invitations_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
