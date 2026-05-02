-- Run this in your Supabase SQL editor BEFORE running jobber-migrate.mjs
-- Adds jobber_id columns used for deduplication across migration runs

ALTER TABLE crm_accounts    ADD COLUMN IF NOT EXISTS jobber_id text;
ALTER TABLE crm_properties  ADD COLUMN IF NOT EXISTS jobber_id text;
ALTER TABLE quotes          ADD COLUMN IF NOT EXISTS jobber_id text;
ALTER TABLE jobs            ADD COLUMN IF NOT EXISTS jobber_id text;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS jobber_id text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_jobber_id_idx   ON crm_accounts  (jobber_id) WHERE jobber_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_properties_jobber_id_idx ON crm_properties(jobber_id) WHERE jobber_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_jobber_id_idx         ON quotes        (jobber_id) WHERE jobber_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_jobber_id_idx           ON jobs          (jobber_id) WHERE jobber_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_jobber_id_idx       ON invoices      (jobber_id) WHERE jobber_id IS NOT NULL;
