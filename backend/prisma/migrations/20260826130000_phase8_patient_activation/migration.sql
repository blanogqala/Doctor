-- Phase 8 Block 3: patient activation (no temporary passwords)

ALTER TABLE "profiles" ADD COLUMN "activated_at" TIMESTAMP(3);

-- Existing accounts remain valid / already activated.
UPDATE "profiles" SET "activated_at" = "created_at" WHERE "activated_at" IS NULL;

CREATE TABLE "patient_activation_tokens" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_activation_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_activation_tokens_token_hash_key" ON "patient_activation_tokens"("token_hash");
CREATE INDEX "patient_activation_tokens_profile_id_idx" ON "patient_activation_tokens"("profile_id");
CREATE INDEX "patient_activation_tokens_practice_id_idx" ON "patient_activation_tokens"("practice_id");
CREATE INDEX "patient_activation_tokens_expires_at_idx" ON "patient_activation_tokens"("expires_at");

ALTER TABLE "patient_activation_tokens"
  ADD CONSTRAINT "patient_activation_tokens_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patient_activation_tokens"
  ADD CONSTRAINT "patient_activation_tokens_practice_id_fkey"
  FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
