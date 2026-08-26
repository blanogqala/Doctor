-- Phase 8 Block 2: revocable Practice + Platform sessions

CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_sessions_token_hash_key" ON "practice_sessions"("token_hash");
CREATE INDEX "practice_sessions_profile_id_idx" ON "practice_sessions"("profile_id");
CREATE INDEX "practice_sessions_practice_id_idx" ON "practice_sessions"("practice_id");
CREATE INDEX "practice_sessions_expires_at_idx" ON "practice_sessions"("expires_at");

ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_practice_id_fkey"
  FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "super_admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");
CREATE INDEX "platform_sessions_super_admin_id_idx" ON "platform_sessions"("super_admin_id");
CREATE INDEX "platform_sessions_expires_at_idx" ON "platform_sessions"("expires_at");

ALTER TABLE "platform_sessions"
  ADD CONSTRAINT "platform_sessions_super_admin_id_fkey"
  FOREIGN KEY ("super_admin_id") REFERENCES "super_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
