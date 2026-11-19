-- SCOPE-106 / T008 — per-project business chrome (header/footer) on projectthemes.
-- Nullable jsonb: a project without chrome renders theme.css only (backward compatible
-- with SCOPE-062). Holds a BusinessChrome object (logoRef, appName, footerLine).
ALTER TABLE "projectthemes" ADD COLUMN IF NOT EXISTS "chrome" jsonb;
