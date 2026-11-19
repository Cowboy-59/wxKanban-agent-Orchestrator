-- [SCOPE 111 / Amendment A] Project-level testing opt-out.
--
-- Additive and idempotent. Defaults to FALSE so no existing project changes
-- behaviour: a project only stops being gated when someone deliberately turns
-- this on, which is the correct direction for a safety escape hatch.
ALTER TABLE companyprojects ADD COLUMN IF NOT EXISTS skiptesting boolean NOT NULL DEFAULT false;

-- The gate reads this on every completion check and every phase render, always
-- alongside the project id, so it rides the existing primary key — no index needed.
