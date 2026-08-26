-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "practice_type" AS ENUM ('SOLO', 'SMALL_CLINIC', 'LARGE_CLINIC');

-- CreateTable
CREATE TABLE "practice_inquiries" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "practice_name" TEXT,
    "hpcsa_number" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "practice_type" "practice_type" NOT NULL,
    "referral_source" TEXT,
    "message" TEXT,
    "status" "inquiry_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_inquiries_status_idx" ON "practice_inquiries"("status");

-- CreateIndex
CREATE INDEX "practice_inquiries_created_at_idx" ON "practice_inquiries"("created_at");

-- CreateIndex
CREATE INDEX "super_admin_notifications_read_idx" ON "super_admin_notifications"("read");

-- CreateIndex
CREATE INDEX "super_admin_notifications_created_at_idx" ON "super_admin_notifications"("created_at");
