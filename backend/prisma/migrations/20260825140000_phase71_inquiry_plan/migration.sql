-- Phase 7.1: inquiry plan alignment — additive, backward compatible
ALTER TABLE "practice_inquiries" ADD COLUMN "province" TEXT;
ALTER TABLE "practice_inquiries" ADD COLUMN "requested_subscription_plan" "subscription_plan";
ALTER TABLE "practice_inquiries" ALTER COLUMN "practice_type" DROP NOT NULL;
