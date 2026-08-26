-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "consultation_started_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "delay_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "doctor_availability_windows" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_availability_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_availability_windows_doctor_id_date_idx" ON "doctor_availability_windows"("doctor_id", "date");

-- AddForeignKey
ALTER TABLE "doctor_availability_windows" ADD CONSTRAINT "doctor_availability_windows_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
