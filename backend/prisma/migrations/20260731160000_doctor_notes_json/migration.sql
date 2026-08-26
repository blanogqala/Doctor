-- AlterTable
ALTER TABLE "medical_records" ALTER COLUMN "doctor_notes_private" TYPE jsonb USING CASE
  WHEN "doctor_notes_private" IS NULL THEN NULL
  WHEN trim("doctor_notes_private") = '' THEN NULL
  ELSE jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'heading', 'Private note',
      'content', "doctor_notes_private",
      'author_name', 'Doctor',
      'created_at', now()::text
    )
  )
END;
