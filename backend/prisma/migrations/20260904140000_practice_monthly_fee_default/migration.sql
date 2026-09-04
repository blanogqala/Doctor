-- Change the column default for newly inserted Practices only.
-- Does NOT rewrite existing practices.monthly_fee_cents values
-- (negotiated agreements and historical invoices stay as persisted).
ALTER TABLE "practices" ALTER COLUMN "monthly_fee_cents" SET DEFAULT 99900;
