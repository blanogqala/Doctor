-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('CHAT', 'SYSTEM');

-- AlterTable appointments
ALTER TABLE "appointments" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

-- AlterTable messages
ALTER TABLE "messages" ADD COLUMN "appointment_id" UUID;
ALTER TABLE "messages" ADD COLUMN "type" "message_type" NOT NULL DEFAULT 'CHAT';

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "messages_appointment_id_idx" ON "messages"("appointment_id");
