-- [SCOPE 051 / FR-004] Per-user language preference.
-- Adds userprofiles.language (preferred UI locale, e.g. 'en-US'). Existing rows
-- default to 'en-US'; the column is browser-seeded on first login and editable
-- in profile settings.
ALTER TABLE "userprofiles"
  ADD COLUMN IF NOT EXISTS "language" varchar(10) NOT NULL DEFAULT 'en-US';
