-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "parent_record_id" UUID;

-- AlterTable
ALTER TABLE "medical_records" ADD COLUMN "parent_record_id" UUID;

-- CreateIndex
CREATE INDEX "appointments_parent_record_id_idx" ON "appointments"("parent_record_id");

-- CreateIndex
CREATE INDEX "medical_records_parent_record_id_idx" ON "medical_records"("parent_record_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_parent_record_id_fkey" FOREIGN KEY ("parent_record_id") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_parent_record_id_fkey" FOREIGN KEY ("parent_record_id") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
